import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { ConfigLoader } from "#lib/project/config-loader.ts"
import { listPresetModules, listRulesFolders, readLintConfig } from "#lib/project/lint-config.ts"
import { ConfigLoadFailed } from "#lib/shared/errors.ts"

const REPO_ROOT = join(import.meta.dirname, "../../../..")

// The presets load from their source, as `trial.test.ts` loads them.
function importPreset(name: string, file: string) {
  return `import ${name} from ${JSON.stringify(join(REPO_ROOT, "presets", file))}`
}

const LAYER = Layer.mergeAll(
  NodeServices.layer,
  ConfigLoader.layer.pipe(Layer.provide(NodeServices.layer))
)

describe("ConfigLoader", () => {
  let project: string

  function write(path: string, content: string) {
    mkdirSync(dirname(join(project, path)), { recursive: true })
    writeFileSync(join(project, path), content)
  }

  beforeEach(() => {
    // Node.js names a module by its real path, and the temporary folder can be a link.
    project = realpathSync(mkdtempSync(join(tmpdir(), "adamantite-config-loader-")))
  })

  afterEach(() => {
    rmSync(project, { force: true, recursive: true })
  })

  it.live(
    "read the presets, the rules folders, and the options of a config that Node.js runs",
    () =>
      Effect.gen(function* () {
        write(
          "tooling/lint/index.ts",
          `${importPreset("custom", "rules/index.ts")}\n\nexport default custom({ dir: "rules", name: "acme" })\n`
        )
        write(
          "oxlint.config.ts",
          [
            importPreset("core", "lint/core.ts"),
            importPreset("strict", "lint/strict.ts"),
            'import tooling from "./tooling/lint/index.ts"',
            "",
            "const shared: { typeAware: boolean } = { typeAware: true }",
            "",
            "export default { extends: [strict, { ...core }, tooling], options: { ...shared, typeCheck: true } }",
            "",
          ].join("\n")
        )

        const config = (yield* readLintConfig(project, join(project, "oxlint.config.ts"))).pipe(
          Option.flatMap(Result.getSuccess),
          Option.getOrThrow
        )

        expect({
          options: config.options,
          presets: listPresetModules(config),
          rulesFolders: listRulesFolders(config),
        }).toStrictEqual({
          options: { typeAware: true, typeCheck: true },
          presets: ["adamantite/lint/strict", "adamantite/lint", "adamantite/rules"],
          rulesFolders: [
            {
              caller: join(project, "tooling/lint/index.ts"),
              dir: join(project, "tooling/lint/rules"),
              module: "adamantite/rules",
              name: "acme",
            },
          ],
        })
      }).pipe(Effect.provide(LAYER))
  )

  it.live("keep what a config prints apart from the config", () =>
    Effect.gen(function* () {
      write(
        "oxlint.config.ts",
        'console.log("loading")\nexport default { rules: { "no-debugger": "error" } }\n'
      )

      expect(
        yield* (yield* ConfigLoader).load(project, join(project, "oxlint.config.ts"))
      ).toStrictEqual({
        rules: { "no-debugger": "error" },
      })
    }).pipe(Effect.provide(LAYER))
  )

  // Oxlint imports a nested config in the process that `adamantite check` starts at the project
  // root, so `process.cwd()` in the config names the root.
  it.live("load a nested config in the project root, as Oxlint does", () =>
    Effect.gen(function* () {
      write("package.json", '{ "name": "root" }\n')
      write("packages/web/package.json", '{ "name": "web" }\n')
      write(
        "packages/web/oxlint.config.ts",
        [
          'import { readFileSync } from "node:fs"',
          'import { join } from "node:path"',
          "",
          'const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"))',
          "",
          "export default { settings: { package: manifest.name } }",
          "",
        ].join("\n")
      )

      expect(
        yield* (yield* ConfigLoader).load(project, join(project, "packages/web/oxlint.config.ts"))
      ).toStrictEqual({ settings: { package: "root" } })
    }).pipe(Effect.provide(LAYER))
  )

  it.live.each([
    { content: 'throw new Error("The config is broken.")\n', reason: "The config is broken." },
    { content: "export const config = {}\n", reason: "The module has no default export." },
    {
      content: "process.exit(0)\n",
      reason: "The config stopped Node.js before it exported a value.",
    },
  ])("fail with the reason of a config that does not load: $reason", ({ content, reason }) =>
    Effect.gen(function* () {
      write("oxlint.config.ts", content)

      const file = join(project, "oxlint.config.ts")

      expect(yield* Effect.result((yield* ConfigLoader).load(project, file))).toStrictEqual(
        Result.fail(new ConfigLoadFailed({ file, reason }))
      )
    }).pipe(Effect.provide(LAYER))
  )
})
