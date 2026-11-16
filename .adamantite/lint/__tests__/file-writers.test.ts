import { join } from "node:path"
import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import rule from "../file-writers.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const ROOT = join(import.meta.dirname, "../../..")

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" }, sourceType: "module" },
})

function file(path: string) {
  return join(ROOT, path)
}

const READER = file("src/lib/toolchain/reader.ts")

const IMPORTS =
  'import * as Effect from "effect/Effect"\nimport * as FileSystem from "effect/FileSystem"\n'

// Code that writes in each form that the rule reports.
const WRITES = `${IMPORTS}import { ensureDirectory } from "#lib/shared/filesystem.ts"
export const write = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString("a", "b")
  yield* ensureDirectory("c")
})
`

function write(method: string) {
  return { data: { method }, messageId: "write" }
}

function nodeFs(source: string) {
  return { data: { source }, messageId: "nodeFs" }
}

tester.run("file-writers", rule, {
  invalid: [
    {
      code: WRITES,
      errors: [
        { data: { name: "ensureDirectory" }, messageId: "helper" },
        write("writeFileString"),
      ],
      filename: READER,
    },
    {
      code: `${IMPORTS}export const remove = Effect.gen(function* () {\n  const fs = yield* FileSystem.FileSystem\n  yield* fs["remove"]("a")\n})`,
      errors: [write("remove")],
      filename: READER,
    },
    {
      code: `${IMPORTS}export const make = Effect.gen(function* () {\n  const { makeDirectory, readFileString } = yield* FileSystem.FileSystem\n  yield* readFileString("a")\n  yield* makeDirectory("b")\n})`,
      errors: [write("makeDirectory")],
      filename: READER,
    },
    {
      code: `${IMPORTS}export const copy = Effect.flatMap(FileSystem.FileSystem, (fs) => fs.copyFile("a", "b"))`,
      errors: [write("copyFile")],
      filename: READER,
    },
    {
      code: `${IMPORTS}export const remove = FileSystem.FileSystem.pipe(Effect.flatMap(({ remove }) => remove("a")))`,
      errors: [write("remove")],
      filename: READER,
    },
    {
      code: 'import * as Effect from "effect/Effect"\nimport { FileSystem } from "effect/FileSystem"\nexport const rename = Effect.gen(function* () {\n  yield* (yield* FileSystem).rename("a", "b")\n})',
      errors: [write("rename")],
      filename: READER,
    },
    {
      code: 'import { ensureDirectory, readFile, writeFile } from "#lib/shared/filesystem.ts"\nexport { ensureDirectory, readFile, writeFile }',
      errors: [
        { data: { name: "ensureDirectory" }, messageId: "helper" },
        { data: { name: "writeFile" }, messageId: "helper" },
      ],
      filename: READER,
    },
    {
      code: 'import { readFileSync } from "node:fs"\nimport { writeFile } from "node:fs/promises"\nimport fs from "fs"\nimport * as promises from "fs/promises"\nexport const files = [readFileSync, writeFile, fs, promises, import("node:fs")]',
      errors: [
        nodeFs("node:fs"),
        nodeFs("node:fs/promises"),
        nodeFs("fs"),
        nodeFs("fs/promises"),
        nodeFs("node:fs"),
      ],
      filename: READER,
    },
    // The root `effect` export is the same module as `effect/FileSystem`.
    {
      code: 'import { Effect, FileSystem as Files } from "effect"\nexport const remove = Effect.gen(function* () {\n  const fs = yield* Files.FileSystem\n  yield* fs.remove("a")\n})',
      errors: [write("remove")],
      filename: READER,
    },
    {
      code: 'import * as Fx from "effect"\nexport const copy = Fx.Effect.flatMap(Fx.FileSystem.FileSystem, (fs) => fs.copy("a", "b"))',
      errors: [write("copy")],
      filename: READER,
    },
    // A relative path and a namespace reach the same helpers.
    {
      code: 'import { writeFile } from "../shared/filesystem.ts"\nexport const write = writeFile("a", "b")',
      errors: [{ data: { name: "writeFile" }, messageId: "helper" }],
      filename: READER,
    },
    {
      code: 'import * as Files from "#lib/shared/filesystem.ts"\nexport const write = Files.writeFile("a", "b")\nexport const read = Files.readFile("a")',
      errors: [{ data: { name: "writeFile" }, messageId: "helper" }],
      filename: READER,
    },
    // A step before the write keeps the service.
    {
      code: `${IMPORTS}export const remove = FileSystem.FileSystem.pipe(\n  Effect.withSpan("remove"),\n  Effect.tap((fs) => fs.makeDirectory("a")),\n  Effect.flatMap((fs) => fs.remove("a"))\n)`,
      errors: [write("makeDirectory"), write("remove")],
      filename: READER,
    },
    // A pipe step counts by the Effect export that it reads, however the import spells it.
    {
      code: `${IMPORTS}import { withSpan } from "effect/Effect"
export const remove = FileSystem.FileSystem.pipe(
  withSpan("read"),
  Effect.flatMap((fs) => fs.remove("a"))
)`,
      errors: [write("remove")],
      filename: READER,
    },
    {
      code: `import * as FileSystem from "effect/FileSystem"
import { flatMap, flatMap as chain } from "effect/Effect"
export const remove = FileSystem.FileSystem.pipe(flatMap((fs) => fs.remove("a")))
export const rename = FileSystem.FileSystem.pipe(chain((fs) => fs.rename("a", "b")))`,
      errors: [write("remove"), write("rename")],
      filename: READER,
    },
    {
      code: `import * as FileSystem from "effect/FileSystem"
import { tap } from "effect/Effect"
export const make = FileSystem.FileSystem.pipe(tap((fs) => fs.makeDirectory("a")))`,
      errors: [write("makeDirectory")],
      filename: READER,
    },
    {
      code: `import { Effect, FileSystem } from "effect"
import * as Fx from "effect"
export const remove = FileSystem.FileSystem.pipe(
  Effect.withSpan("read"),
  Fx.Effect.flatMap((fs) => fs.remove("a"))
)`,
      errors: [write("remove")],
      filename: READER,
    },
    // A writer goes through `FileSystem` too.
    {
      code: 'import { rmSync } from "node:fs"\nexport { rmSync }',
      errors: [nodeFs("node:fs")],
      filename: file("src/lib/setup/index.ts"),
    },
  ],
  valid: [
    {
      code: `${IMPORTS}export const read = Effect.gen(function* () {\n  const fs = yield* FileSystem.FileSystem\n  return yield* fs.readFileString("a")\n})\nexport const exists = FileSystem.FileSystem.pipe(Effect.flatMap((fs) => fs.exists("a")))`,
      filename: READER,
    },
    // Only the `FileSystem` service writes. Another `fs` or `remove` is not the service.
    {
      code: `${IMPORTS}import * as Ref from "effect/Ref"
export const read = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const clear = (fs: { remove: (path: string) => void }) => fs.remove("a")
  const list = { remove: (path: string) => path }
  list.remove("b")
  return [clear, yield* fs.readFileString("c")]
})
export const update = Effect.flatMap(Ref.make(0), (fs) => Ref.set(fs, 1))
`,
      filename: READER,
    },
    // A step that does not come from Effect ends the service, whatever its name.
    {
      code: `${IMPORTS}const withSpan = (name: string) => <A>(self: A) => self
export const remove = FileSystem.FileSystem.pipe(
  withSpan("read"),
  Effect.flatMap((fs) => fs.remove("a"))
)`,
      filename: READER,
    },
    {
      code: `import * as FileSystem from "effect/FileSystem"
const Steps = { flatMap: (f: (value: unknown) => unknown) => f }
export const remove = FileSystem.FileSystem.pipe(Steps.flatMap((fs) => fs.remove("a")))`,
      filename: READER,
    },
    // A pipe step that may change the value ends the service: `map` returns another object, and
    // `Effect.as` is a step that the rule does not know.
    {
      code: `${IMPORTS}export const clear = FileSystem.FileSystem.pipe(
  Effect.map(() => ({ remove: () => Effect.succeed("memory only") })),
  Effect.flatMap((collection) => collection.remove())
)
`,
      filename: READER,
    },
    {
      code: `${IMPORTS}export const reset = FileSystem.FileSystem.pipe(
  Effect.as({ remove: () => Effect.void }),
  Effect.flatMap((cache) => cache.remove())
)
`,
      filename: READER,
    },
    {
      code: 'import { Effect, FileSystem } from "effect"\nexport const read = Effect.gen(function* () {\n  const fs = yield* FileSystem.FileSystem\n  return yield* fs.readFileString("a")\n})',
      filename: READER,
    },
    {
      code: 'import { readFile, readFileIfExists } from "#lib/shared/filesystem.ts"\nexport { readFile, readFileIfExists }',
      filename: READER,
    },
    ...[
      "src/lib/setup/index.ts",
      "src/lib/project/custom-rules/index.ts",
      "src/lib/integrations/effect-sdk.ts",
      "src/lib/hardening/trial.ts",
      "src/lib/hardening/oxlint.ts",
      "src/lib/integrations/oxlint/probe.ts",
      "src/lib/shared/filesystem.ts",
    ].map((writer) => ({ code: WRITES, filename: file(writer) })),
    // Tests write their fixtures, and the macros read templates at build time.
    { code: WRITES, filename: file("src/lib/toolchain/__tests__/index.test.ts") },
    {
      code: 'import { readFileSync } from "node:fs"\nexport const template = () => readFileSync("a", "utf8")',
      filename: file("src/lib/toolchain/template.macro.ts"),
    },
    // The rule covers only `src`.
    {
      code: 'import { writeFileSync } from "node:fs"\nexport { writeFileSync }',
      filename: file("scripts/release.ts"),
    },
  ],
})
