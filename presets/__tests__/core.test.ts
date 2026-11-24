import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import { STACK_OPTIONS } from "./stacks.ts"

const REPO_ROOT = join(import.meta.dirname, "../..")
const CORE_PRESET = join(REPO_ROOT, "presets/lint/core.ts")

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ diagnostics: Schema.Array(Schema.Struct({ code: Schema.String })) })
  )
)

const decodeTypeCheckOutput = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      diagnostics: Schema.Array(Schema.Struct({ code: Schema.String, filename: Schema.String })),
    })
  )
)

interface TypeCheckTsconfig {
  readonly compilerOptions?: Readonly<Record<string, boolean | string>>
  readonly exclude?: readonly string[]
}

function typeCheck(
  files: Record<string, string>,
  { compilerOptions = {}, exclude }: TypeCheckTsconfig = {}
) {
  const project = mkdtempSync(join(tmpdir(), "adamantite-core-"))

  try {
    symlinkSync(join(REPO_ROOT, "node_modules"), join(project, "node_modules"))

    for (const [file, source] of Object.entries(files)) {
      writeFileSync(join(project, file), source)
    }

    writeFileSync(
      join(project, "package.json"),
      JSON.stringify({ name: "fixture", type: "module" })
    )
    writeFileSync(
      join(project, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "esnext",
          moduleResolution: "bundler",
          strict: true,
          ...compilerOptions,
        },
        exclude,
      })
    )
    writeFileSync(
      join(project, "oxlint.config.ts"),
      [
        `import core from ${JSON.stringify(CORE_PRESET)}`,
        "",
        "export default {",
        "  extends: [core],",
        "  ignorePatterns: core.ignorePatterns,",
        `  options: ${JSON.stringify(STACK_OPTIONS)},`,
        "}",
        "",
      ].join("\n")
    )

    const result = spawnSync(
      process.execPath,
      [join(REPO_ROOT, "src/oxlint/index.ts"), "-c", "oxlint.config.ts", "-f", "json", "."],
      { cwd: project, encoding: "utf8" }
    )

    // The config imports the preset by its absolute path, which `import/no-absolute-path` reports.
    return decodeTypeCheckOutput(result.stdout).diagnostics.flatMap(({ code, filename }) =>
      filename === "oxlint.config.ts" ? [] : [{ code, filename }]
    )
  } finally {
    rmSync(project, { force: true, recursive: true })
  }
}

const TYPE_ERROR = "export const answer: string = 42\n"

function lint(file: string, source: string) {
  const project = mkdtempSync(join(tmpdir(), "adamantite-core-"))

  try {
    symlinkSync(join(REPO_ROOT, "node_modules"), join(project, "node_modules"))
    writeFileSync(join(project, file), source)
    writeFileSync(
      join(project, "package.json"),
      JSON.stringify({ name: "fixture", type: "module" })
    )
    writeFileSync(
      join(project, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "esnext", moduleResolution: "bundler", strict: true },
      })
    )
    writeFileSync(
      join(project, "oxlint.config.ts"),
      [
        `import core from ${JSON.stringify(CORE_PRESET)}`,
        "",
        "export default { extends: [core], options: { typeAware: true } }",
        "",
      ].join("\n")
    )

    const result = spawnSync(
      process.execPath,
      [join(REPO_ROOT, "src/oxlint/index.ts"), "-c", "oxlint.config.ts", "-f", "json", file],
      { cwd: project, encoding: "utf8" }
    )

    return decodeOxlintJsonOutput(result.stdout).diagnostics.map((diagnostic) => diagnostic.code)
  } finally {
    rmSync(project, { force: true, recursive: true })
  }
}

describe("core preset", () => {
  it.each([
    ["handle-callback-err", "index.js", "export function load(err, data) { console.info(data) }"],
    ["no-exports-assign", "index.cjs", "exports = {}"],
    [
      "no-mixed-requires",
      "index.cjs",
      'const count = 1, fs = require("node:fs"); console.info(count, fs)',
    ],
    ["no-new-require", "index.cjs", 'const fs = new require("node:fs"); console.info(fs)'],
    ["no-path-concat", "index.cjs", 'console.info(__dirname + "/file")'],
  ])("report node/%s without a separate preset", (rule, file, source) => {
    expect(lint(file, source)).toContain(`node(${rule})`)
  })

  it.each([
    [
      "loader.ts",
      'export function parse(loadModule: (key: string) => string) { const count = 1, item = loadModule("key"); return [item, count] }',
    ],
    [
      "index.ts",
      'export function create(Module: new (key: string) => object) { return new Module("key") }',
    ],
    ["index.d.ts", "export declare function onError(error: Error): void"],
  ])("accept local module operations and error declarations in %s", (file, source) => {
    expect(lint(file, source)).toStrictEqual([])
  })

  it("accept an await in a loop", () => {
    const codes = lint(
      "index.ts",
      [
        "export async function send(urls: readonly string[]) {",
        "  for (const url of urls) {",
        "    await fetch(url)",
        "  }",
        "}",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  it("report a thrown value that is not an error one time", () => {
    const codes = lint(
      "index.ts",
      ["export function fail(): never {", '  throw "failed"', "}", ""].join("\n")
    )

    expect(codes).toStrictEqual(["typescript(only-throw-error)"])
  })

  it.each([
    ["card.astro", ["---", "const a = 1", "---", "<p>{a}</p>", ""]],
    [
      "card.vue",
      [
        '<script setup lang="ts">',
        "const a = 1",
        "</script>",
        "<template><p>{{ a }}</p></template>",
        "",
      ],
    ],
    ["card.svelte", ['<script lang="ts">', "const a = 1", "</script>", "<p>{a}</p>", ""]],
  ])("accept a script without an import or export in %s", (file, lines) => {
    const codes = lint(file, lines.join("\n"))

    expect(codes).toStrictEqual([])
  })

  it("report a TypeScript file without an import or export", () => {
    const codes = lint("index.ts", ["console.info(1)", ""].join("\n"))

    expect(codes).toStrictEqual(["import(unambiguous)"])
  })

  it("accept a declaration file without an import or export", () => {
    const codes = lint(
      "raw.d.ts",
      [
        'declare module "*?raw" {',
        "  const content: string",
        "  export default content",
        "}",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  it("accept a type and a value that share a name", () => {
    const codes = lint(
      "index.ts",
      ["export const port = 8080", "export type port = typeof port", ""].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  it("accept JSDoc type tags in a JavaScript file and report them in a TypeScript file", () => {
    const source = ["/** @type {string[]} */", "export const names = []", ""].join("\n")

    expect(lint("names.mjs", source)).toStrictEqual([])
    expect(lint("names.ts", source)).toContain("jsdoc(check-tag-names)")
  })

  it("accept a spread copy of an item in a map callback", () => {
    const codes = lint(
      "index.ts",
      [
        "interface Todo {",
        "  readonly done: boolean",
        "  readonly id: string",
        "}",
        "",
        "declare function loadTodos(): Todo[]",
        "",
        "export function toggle(id: string): Todo[] {",
        "  return loadTodos().map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo))",
        "}",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  it("accept an Object.assign copy of a reduce accumulator", () => {
    const codes = lint(
      "index.ts",
      [
        "const items = [{ n: 1 }, { n: 2 }]",
        "",
        "export const total = items.reduce((acc, item) => Object.assign({}, acc, { sum: acc.sum + item.n }), {",
        "  sum: 0,",
        "})",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  it("accept required undefined arguments and explicit callback results", () => {
    const codes = lint(
      "index.ts",
      [
        "declare function consumeCallback(callback: () => undefined): void",
        "declare function consume(value: undefined): void",
        "declare const flags: boolean[]",
        "",
        "consume(undefined)",
        "consumeCallback(() => undefined)",
        "",
        "export const expression = flags.map((flag) => flag ? 1 : undefined)",
        "",
        "export const mapped = flags.map((flag): number | undefined => {",
        "  if (flag) {",
        "    return 1",
        "  }",
        "",
        "  return undefined",
        "})",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  it("report a redundant undefined yield", () => {
    const codes = lint(
      "index.ts",
      ["export function* values() {", "  yield undefined", "}", ""].join("\n")
    )

    expect(codes).toStrictEqual(["unicorn(no-useless-undefined)"])
  })

  it("report an unannotated explicit undefined return", () => {
    const codes = lint(
      "index.ts",
      [
        "declare const flags: boolean[]",
        "",
        "export const mapped = flags.map((flag) => {",
        "  if (flag) {",
        "    return 1",
        "  }",
        "",
        "  return undefined",
        "})",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual(["unicorn(no-useless-undefined)"])
  })

  it.each([
    ["export const empty = () => {}", "eslint(no-empty-function)"],
    [
      "export const mapped = [1].map((value) => { console.info(value) })",
      "eslint(array-callback-return)",
    ],
    ["export function noop() { return }", "eslint(no-useless-return)"],
  ])("report invalid callback or return code: %s", (source, code) => {
    expect(lint("index.ts", `${source}\n`)).toContain(code)
  })

  it("report a union of a promise and its awaited type in a condition", () => {
    const codes = lint(
      "index.ts",
      [
        "declare const value: Promise<number> | number",
        "",
        "export const ready = value ? 1 : 0",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual(["typescript(no-misused-promises)"])
  })

  it("accept an optional promise in a condition", () => {
    const codes = lint(
      "index.ts",
      [
        "declare const pending: Promise<void> | undefined",
        "",
        "export async function settle(): Promise<void> {",
        "  if (pending) {",
        "    await pending",
        "  }",
        "}",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  it("not recommend the non-null assertion that core bans", () => {
    const codes = lint(
      "index.ts",
      [
        "declare const maybe: string | undefined",
        "",
        "export const a: string = maybe as string",
        "export const b: string = maybe!",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual(["typescript(no-non-null-assertion)"])
  })
})

describe("core preset with the type check", () => {
  it("report a type error in a linted file", () => {
    expect(typeCheck({ "index.ts": TYPE_ERROR })).toStrictEqual([
      { code: "typescript(TS2322)", filename: "index.ts" },
    ])
  })

  it("skip a type error in generated code that the core ignore patterns cover", () => {
    expect(
      typeCheck({ "index.ts": "export const one = 1\n", "routes.gen.ts": TYPE_ERROR })
    ).toStrictEqual([])
  })

  it("report a type error in a linted file that the tsconfig excludes", () => {
    expect(
      typeCheck(
        { "excluded.ts": TYPE_ERROR, "index.ts": "export const one = 1\n" },
        { exclude: ["excluded.ts"] }
      )
    ).toStrictEqual([{ code: "typescript(TS2322)", filename: "excluded.ts" }])
  })

  it("report an invalid compiler option", () => {
    expect(
      typeCheck(
        { "index.ts": "export const one = 1\n" },
        { compilerOptions: { notAnOption: true } }
      )
    ).toStrictEqual([{ code: "typescript(tsconfig-error)", filename: "tsconfig.json" }])
  })
})
