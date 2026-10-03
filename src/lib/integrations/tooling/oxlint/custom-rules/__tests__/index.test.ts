import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import type { IntegrationAssessment } from "#lib/integrations/base.ts"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import customRules from "#lib/integrations/tooling/oxlint/custom-rules/index.ts"

const ROOT = "/project"

const RULE =
  'import { defineRule } from "adamantite/rules"\n\nexport default defineRule({ create: () => ({}) })\n'

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
    'import custom from "adamantite/lint/custom"',
    ...imports,
    "",
    `export default defineConfig({ extends: [${extendsList}] })`,
    "",
  ].join("\n")
}

function runAssess(files: FileSystemTestContext) {
  return customRules.assess(ROOT).pipe(Effect.provide(Layer.mergeAll(files.layer, Path.layer)))
}

function getFindings(assessment: IntegrationAssessment) {
  return assessment.applicable ? assessment.findings : []
}

describe("custom-rules", () => {
  it.effect("report not applicable without a rules folder or a custom() call", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "oxlint.config.ts": makeConfig("core"), "package.json": PACKAGE_JSON },
        root: ROOT,
      })

      expect(yield* runAssess(files)).toEqual({ applicable: false, warnings: [] })
    })
  )

  it.effect("report no finding for the config that init writes and a loaded rules folder", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/rules/_helpers.ts": "export const helper = 1\n",
          ".adamantite/rules/AGENTS.md": "# Custom rules\n",
          ".adamantite/rules/no-process-env.ts": RULE,
          "oxlint.config.ts": toOxlintTsConfigContent(["react"]),
          "package.json": PACKAGE_JSON,
        },
        root: ROOT,
      })

      expect(yield* runAssess(files)).toEqual({
        applicable: true,
        findings: [],
        packageActions: [],
        warnings: [],
      })
    })
  )

  it.effect("report a rules folder that no custom() call loads", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/rules/no-process-env.ts": RULE,
          "oxlint.config.ts": makeConfig("core"),
          "package.json": PACKAGE_JSON,
        },
        root: ROOT,
      })

      const findings = getFindings(yield* runAssess(files))

      expect(findings).toEqual([
        expect.objectContaining({
          currentState:
            "`.adamantite/rules` has 1 rule file(s), but no `custom()` call loads it, so Oxlint does not run them.",
          id: "custom-rules-not-loaded:.adamantite/rules",
          integration: "custom-rules",
        }),
      ])
    })
  )

  it.effect("report a rules folder when only a module that no config imports calls custom()", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/rules/no-process-env.ts": RULE,
          "oxlint.config.ts": makeConfig("core"),
          "package.json": PACKAGE_JSON,
          "scratch.ts": 'import custom from "adamantite/lint/custom"\n\nexport default custom()\n',
        },
        root: ROOT,
      })

      const findings = getFindings(yield* runAssess(files))

      expect(findings.map((finding) => finding.id)).toEqual([
        "custom-rules-not-loaded:.adamantite/rules",
      ])
    })
  )

  it.effect("follow a relative import from the config to the module that calls custom()", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/rules/no-process-env.ts": RULE,
          "lint/rules.ts": [
            'import custom from "adamantite/lint/custom"',
            "",
            'export default custom({ dir: "../.adamantite/rules" })',
            "",
          ].join("\n"),
          "oxlint.config.ts": makeConfig("core, rules", ['import rules from "./lint/rules.js"']),
          "package.json": PACKAGE_JSON,
        },
        root: ROOT,
      })

      expect(getFindings(yield* runAssess(files))).toEqual([])
    })
  )

  it.effect("report a rule file that cannot load, with the reason", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/rules/no-enum.ts": `enum Kind { A }\n${RULE}`,
          ".adamantite/rules/no-process-env.ts": RULE,
          "oxlint.config.ts": toOxlintTsConfigContent(),
          "package.json": PACKAGE_JSON,
        },
        root: ROOT,
      })

      const [finding, ...rest] = getFindings(yield* runAssess(files))

      expect(rest).toEqual([])
      expect(finding?.id).toBe("custom-rule-cannot-load:.adamantite/rules/no-enum.ts")
      expect(finding?.currentState).toContain(
        "Line 1: `enum` needs a TypeScript transform, which type stripping does not do."
      )
    })
  )

  it.effect("load a rules folder in a monorepo tooling package through a relative dir", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "oxlint.config.ts": makeConfig("core, tooling", ['import tooling from "@acme/lint"']),
          "package.json": MONOREPO_PACKAGE_JSON,
          "packages/web/package.json": JSON.stringify({ name: "web" }),
          "tooling/lint/index.ts": [
            'import custom from "adamantite/lint/custom"',
            "",
            'export default custom({ dir: "rules", name: "acme" })',
            "",
          ].join("\n"),
          "tooling/lint/package.json": JSON.stringify({ name: "@acme/lint" }),
          "tooling/lint/rules/no-enum.ts": `enum Kind { A }\n${RULE}`,
        },
        root: ROOT,
      })

      const findings = getFindings(yield* runAssess(files))

      expect(findings.map((finding) => finding.id)).toEqual([
        "custom-rule-cannot-load:tooling/lint/rules/no-enum.ts",
      ])
    })
  )

  it.effect("report a workspace package rules folder that only the root config could load", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "oxlint.config.ts": toOxlintTsConfigContent(),
          "package.json": MONOREPO_PACKAGE_JSON,
          "packages/web/.adamantite/rules/no-window.ts": RULE,
          "packages/web/package.json": JSON.stringify({ name: "web" }),
        },
        root: ROOT,
      })

      const findings = getFindings(yield* runAssess(files))

      expect(findings.map((finding) => finding.id)).toEqual([
        "custom-rules-not-loaded:packages/web/.adamantite/rules",
      ])
      expect(findings[0]?.goal[0]).toContain("in the Oxlint config of `packages/web`")
    })
  )

  it.effect("report two loaded rules folders that share a plugin name", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/rules/no-process-env.ts": RULE,
          "oxlint.config.ts": toOxlintTsConfigContent(),
          "package.json": MONOREPO_PACKAGE_JSON,
          "packages/web/.adamantite/rules/no-window.ts": RULE,
          "packages/web/oxlint.config.ts": makeConfig("root, custom()", [
            'import root from "../../oxlint.config.ts"',
          ]),
          "packages/web/package.json": JSON.stringify({ name: "web" }),
        },
        root: ROOT,
      })

      const findings = getFindings(yield* runAssess(files))

      expect(findings).toEqual([
        expect.objectContaining({
          currentState:
            "2 rules folders use the plugin name `project`: `.adamantite/rules`, `packages/web/.adamantite/rules`. Oxlint rejects two plugins with the same name in one run.",
          id: "custom-rules-duplicate-name:project",
        }),
      ])
    })
  )

  it.effect("accept workspace package rules folders with distinct plugin names", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/rules/no-process-env.ts": RULE,
          "oxlint.config.ts": toOxlintTsConfigContent(),
          "package.json": MONOREPO_PACKAGE_JSON,
          "packages/web/.adamantite/rules/no-window.ts": RULE,
          "packages/web/oxlint.config.ts": makeConfig('root, custom({ name: "web" })', [
            'import root from "../../oxlint.config.ts"',
          ]),
          "packages/web/package.json": JSON.stringify({ name: "web" }),
        },
        root: ROOT,
      })

      expect(getFindings(yield* runAssess(files))).toEqual([])
    })
  )

  it.effect(
    "warn about a custom() call that doctor cannot resolve, and skip the folder check",
    () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            ".adamantite/rules/no-process-env.ts": RULE,
            "oxlint.config.ts": makeConfig("core, custom({ dir: RULES_DIR })", [
              'const RULES_DIR = ".adamantite/rules"',
            ]),
            "package.json": PACKAGE_JSON,
          },
          root: ROOT,
        })

        const assessment = yield* runAssess(files)

        expect(getFindings(assessment)).toEqual([])
        expect(assessment.warnings).toEqual([
          "Doctor cannot read the `dir` or `name` of a `custom()` call in `oxlint.config.ts`, because it is not a string literal. Doctor does not check that rules folder.",
        ])
      })
  )
})
