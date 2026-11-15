import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { toProjectPath } from "#lib/hardening/project-files.ts"
import { readSuppressions } from "#lib/hardening/suppressions.ts"
import { getOxlintCommand } from "#lib/integrations/oxlint/entry.ts"
import { OxlintCommand } from "#lib/integrations/oxlint/files.ts"
import { OxlintProbe } from "#lib/integrations/oxlint/probe.ts"

const REPO_ROOT = join(import.meta.dirname, "../../../..")

// The build writes the Oxlint entry and the probe beside the CLI, so a run from source starts their
// source.
const TEST_LAYER = Layer.mergeAll(
  NodeServices.layer,
  Layer.succeed(OxlintCommand)((project) => ({
    ...getOxlintCommand(project),
    args: [join(REPO_ROOT, "src/oxlint.ts")],
  })),
  Layer.succeed(OxlintProbe)(join(REPO_ROOT, "src/probe.ts"))
)

describe("readSuppressions", () => {
  let project: string

  function write(file: string, content: string) {
    mkdirSync(dirname(join(project, file)), { recursive: true })
    writeFileSync(join(project, file), content)
  }

  function read(scope?: string) {
    return Path.Path.pipe(
      Effect.flatMap((path) =>
        readSuppressions(
          project,
          scope === undefined ? null : toProjectPath(path, project, join(project, scope))
        )
      ),
      Effect.map(Option.getOrThrow),
      Effect.provide(TEST_LAYER)
    )
  }

  beforeEach(() => {
    project = realpathSync(mkdtempSync(join(tmpdir(), "adamantite-suppressions-")))
    mkdirSync(join(project, "node_modules"))
    symlinkSync(join(REPO_ROOT, "node_modules/oxlint"), join(project, "node_modules/oxlint"))
    write("package.json", JSON.stringify({ name: "app", type: "module" }))
    write("oxlint.config.ts", 'export default { ignorePatterns: ["src/fixtures/**"] }\n')
  })

  afterEach(() => {
    rmSync(project, { force: true, recursive: true })
  })

  it.live("count the disable comments of each rule, with the line of each comment", () =>
    Effect.gen(function* () {
      write(
        "src/a.ts",
        [
          "/* oxlint-disable no-console, eslint/no-alert */",
          "// eslint-disable-next-line typescript/no-explicit-any -- the API returns any",
          "export const value: any = 1 // oxlint-disable-line no-console",
          "// eslint-disable",
          "",
        ].join("\n")
      )
      write("src/b.tsx", "/* oxlint-disable */\nexport const b = <div />\n")

      expect(yield* read()).toStrictEqual([
        // A comment that names no rule turns off all rules, and comes first among equal counts.
        { locations: ["src/a.ts:4", "src/b.tsx:1"], rule: Option.none() },
        { locations: ["src/a.ts:1", "src/a.ts:3"], rule: Option.some("no-console") },
        { locations: ["src/a.ts:1"], rule: Option.some("eslint/no-alert") },
        { locations: ["src/a.ts:2"], rule: Option.some("typescript/no-explicit-any") },
      ])
    })
  )

  it.live("skip strings, enable comments, and comments that only mention a directive", () =>
    Effect.gen(function* () {
      write(
        "src/a.ts",
        [
          'export const text = "// oxlint-disable-next-line no-console"',
          "// oxlint-enable no-console",
          "/**",
          " * oxlint-disable-line no-console",
          " */",
          "// Use oxlint-disable-next-line only with a reason.",
          "// oxlint-disabled no-console",
          "",
        ].join("\n")
      )

      expect(yield* read()).toStrictEqual([])
    })
  )

  it.live("count none in a file that does not parse or that the config ignores", () =>
    Effect.gen(function* () {
      write("src/broken.ts", "// oxlint-disable\nexport const = ;\n")
      write("src/fixtures/bad.ts", "// oxlint-disable-next-line no-alert\nalert(1)\n")

      expect(yield* read()).toStrictEqual([])
    })
  )

  it.live("count the comments of the scripts of Vue, Svelte, and Astro files at their lines", () =>
    Effect.gen(function* () {
      const comment = "// oxlint-disable-next-line antislop/no-reflect-get -- migration"

      write("src/Jsx.vue", `<script lang="tsx">\n${comment}\nconst view = <div />\n</script>\n`)
      write(
        "src/Setup.vue",
        `<template><div /></template>\n<script setup lang="ts">\n${comment}\nconst value: number = 1\n</script>\n`
      )
      write(
        "src/App.svelte",
        `<script lang="ts">\n${comment}\nconst value = 1\n</script>\n<div>{value}</div>\n`
      )
      write(
        "src/App.astro",
        `---\n${comment}\nconst value = 1\n---\n<div>{value}</div>\n<script>\n\n/* oxlint-disable no-console */\n</script>\n`
      )

      expect(yield* read()).toStrictEqual([
        {
          locations: ["src/App.astro:2", "src/App.svelte:2", "src/Jsx.vue:2", "src/Setup.vue:3"],
          rule: Option.some("antislop/no-reflect-get"),
        },
        { locations: ["src/App.astro:8"], rule: Option.some("no-console") },
      ])
    })
  )

  it.live("count only the comments inside the scope", () =>
    Effect.gen(function* () {
      write("packages/api/src/a.ts", "// oxlint-disable-next-line no-console\nconsole.log(1)\n")
      write("packages/web/src/a.ts", "// oxlint-disable-next-line no-alert\nalert(1)\n")

      expect(yield* read("packages/web")).toStrictEqual([
        { locations: ["packages/web/src/a.ts:1"], rule: Option.some("no-alert") },
      ])
    })
  )
})
