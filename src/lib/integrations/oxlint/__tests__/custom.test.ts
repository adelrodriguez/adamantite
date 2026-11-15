import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import type { IntegrationAssessment } from "#lib/integrations/base.ts"
import { withConfigLoader } from "#__tests__/config-loader.ts"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/oxlint/config.ts"
import oxlintCustom from "#lib/integrations/oxlint/custom.ts"
import { readProject } from "#lib/project/project.ts"
import { FailedToReadFile } from "#lib/shared/errors.ts"
import { stringifyJson } from "#lib/shared/json.ts"

const ROOT = "/project"

const RULE =
  'import { defineRule } from "adamantite/rules/plugin"\n\nexport default defineRule({ create: () => ({}) })\n'

const PACKAGE_JSON = JSON.stringify({
  name: "test-project",
  scripts: { check: "adamantite check" },
})

const MONOREPO_PACKAGE_JSON = JSON.stringify({
  name: "test-monorepo",
  scripts: { check: "adamantite check" },
  workspaces: ["packages/*", "tooling/lint"],
})

function makeConfig(extendsList: string, imports: readonly string[] = []) {
  return [
    'import { defineConfig } from "oxlint"',
    'import core from "adamantite/lint"',
    'import custom from "adamantite/rules"',
    ...imports,
    "",
    `export default defineConfig({ extends: [${extendsList}] })`,
    "",
  ].join("\n")
}

/**
 * Assess with a fake resolver: each specifier in `resolutions` resolves to that path below the
 * root, and other relative specifiers to their exact path. The smoke test covers the real
 * resolver.
 */
function runAssess(files: FileSystemTestContext, resolutions: Record<string, string> = {}) {
  return readProject(ROOT).pipe(
    Effect.flatMap((project) => oxlintCustom.assess(project)),
    Effect.provide(
      withConfigLoader(
        Layer.mergeAll(files.layer, Path.layer, makeModuleResolverLayer(ROOT, resolutions))
      )
    )
  )
}

function getFindings(assessment: IntegrationAssessment) {
  return assessment.applicable ? assessment.findings : []
}

describe("oxlint-custom", () => {
  it.effect.each([".adamantite/lint", "tooling/lint/rules"])(
    "accept optional saved rule tests in %s without editing files",
    (dir) =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            [`${dir}/no-process-env.ts`]: RULE,
            [`${dir}/no-process-env.test.ts`]: "// saved verification case\n",
            "oxlint.config.ts": makeConfig(`core, custom({ dir: "${dir}" })`),
            "package.json": PACKAGE_JSON,
          },
          root: ROOT,
        })

        const before = files.list().map((file) => [file, files.read(file)])

        expect(getFindings(yield* runAssess(files))).toStrictEqual([])
        expect(files.list().map((file) => [file, files.read(file)])).toStrictEqual(before)
      })
  )

  it.effect("report not applicable without a rules folder or a custom() call", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "oxlint.config.ts": makeConfig("core"), "package.json": PACKAGE_JSON },
        root: ROOT,
      })

      expect(yield* runAssess(files)).toStrictEqual({ applicable: false })
    })
  )

  it.effect("report no finding for the config that init writes and a loaded rules folder", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/lint/_helpers.ts": "export const helper = 1\n",
          ".adamantite/lint/AGENTS.md": "# Custom rules\n",
          ".adamantite/lint/no-process-env.ts": RULE,
          "oxlint.config.ts": toOxlintTsConfigContent(["react"]),
          "package.json": PACKAGE_JSON,
        },
        root: ROOT,
      })

      expect(yield* runAssess(files)).toStrictEqual({
        applicable: true,
        findings: [],
        packageActions: [],
        warnings: [],
      })
    })
  )

  it.effect("report an explicit rules folder that does not exist", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "lint-rules/no-process-env.ts": RULE,
          "oxlint.config.ts": makeConfig('core, custom({ dir: "./rules", name: "acme" })'),
          "package.json": PACKAGE_JSON,
        },
        root: ROOT,
      })

      expect(getFindings(yield* runAssess(files))).toStrictEqual([
        expect.objectContaining({
          currentState:
            "The `custom()` call in `oxlint.config.ts` loads `rules`, but that folder does not exist, so Oxlint runs none of its rules.",
          id: "custom-rules-folder-missing:rules",
          integration: "oxlint-custom",
        }),
      ])
    })
  )

  it.effect("accept the default rules folder before the project writes a rule", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "oxlint.config.ts": makeConfig("core, custom()"), "package.json": PACKAGE_JSON },
        root: ROOT,
      })

      expect(getFindings(yield* runAssess(files))).toStrictEqual([])
    })
  )

  it.effect("report a rules folder that no custom() call loads", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/lint/no-process-env.ts": RULE,
          "oxlint.config.ts": makeConfig("core"),
          "package.json": PACKAGE_JSON,
        },
        root: ROOT,
      })

      const findings = getFindings(yield* runAssess(files))

      expect(findings).toStrictEqual([
        expect.objectContaining({
          currentState:
            "No `custom()` call loads the rules in `.adamantite/lint`, so Oxlint does not run them.",
          id: "custom-rules-not-loaded:.adamantite/lint",
          integration: "oxlint-custom",
        }),
      ])
    })
  )

  it.effect("report a rules folder when only a module that no config imports calls custom()", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/lint/no-process-env.ts": RULE,
          "oxlint.config.ts": makeConfig("core"),
          "package.json": PACKAGE_JSON,
          "scratch.ts": 'import custom from "adamantite/rules"\n\nexport default custom()\n',
        },
        root: ROOT,
      })

      const findings = getFindings(yield* runAssess(files))

      expect(findings.map((finding) => finding.id)).toStrictEqual([
        "custom-rules-not-loaded:.adamantite/lint",
      ])
    })
  )

  it.effect("follow a relative import from the config to the module that calls custom()", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/lint/no-process-env.ts": RULE,
          "lint/rules.ts": [
            'import custom from "adamantite/rules"',
            "",
            'export default custom({ dir: "../.adamantite/lint" })',
            "",
          ].join("\n"),
          "oxlint.config.ts": makeConfig("core, rules", ['import rules from "./lint/rules.js"']),
          "package.json": PACKAGE_JSON,
        },
        root: ROOT,
      })

      expect(
        getFindings(yield* runAssess(files, { "./lint/rules.js": "lint/rules.ts" }))
      ).toStrictEqual([])
    })
  )

  it.effect("fail when an Oxlint config cannot be read, instead of using another config", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "oxlint.config.ts": makeConfig("core, custom()"),
          "package.json": MONOREPO_PACKAGE_JSON,
          "packages/app/oxlint.config.ts": makeConfig('core, custom({ name: "app" })'),
          "packages/app/package.json": yield* stringifyJson({ name: "app" }),
        },
        root: ROOT,
      })

      files.makeUnreadable("packages/app/oxlint.config.ts")

      const error = yield* Effect.flip(runAssess(files))

      expect(error).toBeInstanceOf(FailedToReadFile)
    })
  )

  it.effect("load a rules folder in a monorepo tooling package through a relative dir", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "oxlint.config.ts": makeConfig("core, tooling", ['import tooling from "@acme/lint"']),
          "package.json": MONOREPO_PACKAGE_JSON,
          "packages/web/package.json": yield* stringifyJson({ name: "web" }),
          "tooling/lint/index.ts": [
            'import custom from "adamantite/rules"',
            "",
            'export default custom({ dir: "rules", name: "acme" })',
            "",
          ].join("\n"),
          "tooling/lint/package.json": yield* stringifyJson({ name: "@acme/lint" }),
          "tooling/lint/rules/no-process-env.ts": RULE,
        },
        root: ROOT,
      })

      // The `dir` resolves from the tooling module, so the folder exists and loads.
      expect(
        getFindings(yield* runAssess(files, { "@acme/lint": "tooling/lint/index.ts" }))
      ).toStrictEqual([])
    })
  )

  it.effect(
    "warn about a config that imports a module that does not resolve, and skip the folder check",
    () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            ".adamantite/lint/no-process-env.ts": RULE,
            "oxlint.config.ts": makeConfig("core, tooling", [
              'import tooling from "@acme/lint/missing"',
            ]),
            "package.json": yield* stringifyJson({
              name: "test-monorepo",
              workspaces: ["tooling/lint"],
            }),
            "tooling/lint/package.json": yield* stringifyJson({
              exports: { "./config": "./index.ts" },
              name: "@acme/lint",
            }),
          },
          root: ROOT,
        })

        const assessment = yield* runAssess(files)

        expect(getFindings(assessment)).toStrictEqual([])
        expect(assessment.warnings).toStrictEqual([
          expect.stringMatching(
            /^Doctor cannot load `oxlint\.config\.ts`, so it does not check the `custom\(\)` calls and rules folders behind it\. Node\.js reported: /u
          ),
        ])
      })
  )

  it.effect("report a workspace package rules folder that only the root config could load", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "oxlint.config.ts": toOxlintTsConfigContent([]),
          "package.json": MONOREPO_PACKAGE_JSON,
          "packages/web/.adamantite/lint/no-window.ts": RULE,
          "packages/web/package.json": yield* stringifyJson({ name: "web" }),
        },
        root: ROOT,
      })

      const findings = getFindings(yield* runAssess(files))

      expect(findings.map((finding) => finding.id)).toStrictEqual([
        "custom-rules-not-loaded:packages/web/.adamantite/lint",
      ])
      expect(findings[0]?.goal[0]).toContain("in the Oxlint config of `packages/web`")
    })
  )

  it.effect("report two loaded rules folders that share a plugin name", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/lint/no-process-env.ts": RULE,
          "oxlint.config.ts": toOxlintTsConfigContent([]),
          "package.json": MONOREPO_PACKAGE_JSON,
          "packages/web/.adamantite/lint/no-window.ts": RULE,
          "packages/web/oxlint.config.ts": makeConfig("root, custom()", [
            'import root from "../../oxlint.config.ts"',
          ]),
          "packages/web/package.json": yield* stringifyJson({ name: "web" }),
        },
        root: ROOT,
      })

      const findings = getFindings(yield* runAssess(files))

      expect(findings).toStrictEqual([
        expect.objectContaining({
          currentState:
            "2 rules folders use the plugin name `project`: `.adamantite/lint`, `packages/web/.adamantite/lint`. Oxlint rejects two plugins with the same name in one run.",
          id: "custom-rules-duplicate-name:project",
        }),
      ])
    })
  )

  it.effect("accept workspace package rules folders with distinct plugin names", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/lint/no-process-env.ts": RULE,
          "oxlint.config.ts": toOxlintTsConfigContent([]),
          "package.json": MONOREPO_PACKAGE_JSON,
          "packages/web/.adamantite/lint/no-window.ts": RULE,
          "packages/web/oxlint.config.ts": makeConfig('root, custom({ name: "web" })', [
            'import root from "../../oxlint.config.ts"',
          ]),
          "packages/web/package.json": yield* stringifyJson({ name: "web" }),
        },
        root: ROOT,
      })

      expect(getFindings(yield* runAssess(files))).toStrictEqual([])
    })
  )

  it.effect.each([".adamantite/lint", ".adamantite/rules"])(
    "check the rules folder %s that a variable names",
    (folder) =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            [`${folder}/no-process-env.ts`]: RULE,
            "oxlint.config.ts": makeConfig("core, custom({ dir: RULES_DIR })", [
              `const RULES_DIR = "${folder}"`,
            ]),
            "package.json": PACKAGE_JSON,
          },
          root: ROOT,
        })

        expect(yield* runAssess(files)).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
  )

  it.effect("check the folders of a custom() call whose dir and name variables set", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/lint/no-process-env.ts": RULE,
          "oxlint.config.ts": makeConfig('core, custom({ dir: "rules", name: NAME })', [
            'const NAME = "acme"',
          ]),
          "package.json": PACKAGE_JSON,
          "rules/no-window.ts": RULE,
        },
        root: ROOT,
      })

      const assessment = yield* runAssess(files)

      expect(getFindings(assessment).map((finding) => finding.id)).toStrictEqual([
        "custom-rules-not-loaded:.adamantite/lint",
      ])
      expect(assessment.warnings).toStrictEqual([])
    })
  )
})
