import process from "node:process"
import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { makeOxlintFilesLayer } from "#__tests__/oxlint-files.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { formatJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"
const BINDING_SUFFIXES: Partial<Record<NodeJS.Platform, string>> = { linux: "-gnu", win32: "-msvc" }

function makeFiles(files?: Record<string, string>) {
  const target = `${process.platform}-${process.arch}${BINDING_SUFFIXES[process.platform] ?? ""}`

  return createFileSystemTestContext({
    files: {
      "/usr/bin/ldd": "GNU libc",
      [`node_modules/oxlint/dist/oxlint.${target}.node`]: "",
      ...files,
    },
    root: ROOT,
  })
}

function provideFiles(files: FileSystemTestContext, linted: readonly string[] = []) {
  return Effect.provide([
    files.layer,
    makeOxlintFilesLayer(linted),
    Path.layer,
    makeModuleResolverLayer(ROOT, { "oxlint/package.json": "node_modules/oxlint/package.json" }),
  ])
}

function runAssess(files: FileSystemTestContext) {
  return readProject(ROOT).pipe(
    Effect.flatMap((project) => oxlint.assess(project)),
    provideFiles(files)
  )
}

function makePackageJson(manifest: PackageJson) {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...manifest }, null, 2)
}

describe("oxlint", () => {
  describe("create", () => {
    it.effect("create a config that assess accepts", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        yield* oxlint.create(ROOT).pipe(provideFiles(files))

        expect(yield* runAssess(files)).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )
  })

  describe("assess", () => {
    it.effect("report old rule keys and suppressions, then confirm their removal", () =>
      Effect.gen(function* () {
        const config = `import shared from "./shared.ts"
export default { rules: { ...shared, "anti-slop/no-runtime-typeof": "off" }, overrides: [{ files: ["*.ts"], rules: { "anti-slop-effect/no-throw": "off" } }] }`

        const shared = `export default { "anti-slop/no-reflect-get": "off" }`
        const nested = `export default { rules: { "anti-slop/no-reflect-get": "off" } }`

        const source =
          "// oxlint-disable-next-line anti-slop/no-runtime-typeof, anti-slop-effect/no-throw -- migration case\nexport const value = 1\n"

        const files = makeFiles({
          "oxlint.config.ts": config,
          "package.json": makePackageJson({
            scripts: { check: "adamantite check" },
            workspaces: ["packages/*"],
          }),
          "packages/app/oxlint.config.ts": nested,
          "packages/app/package.json": makePackageJson({ name: "app" }),
          "shared.ts": shared,
          "src/a.ts": source,
          "src/ignored.ts": source,
        })

        const assess = () =>
          readProject(ROOT).pipe(
            Effect.flatMap((project) => oxlint.assess(project)),
            provideFiles(files, ["src/a.ts"])
          )

        const before = yield* assess()
        const finding = before.findings?.find((entry) => entry.id === "antislop-rule-migration")

        expect(finding?.currentState.split("\n")).toStrictEqual(
          expect.arrayContaining([
            expect.stringContaining("oxlint.config.ts:2"),
            expect.stringContaining("shared.ts:1"),
            expect.stringContaining("packages/app/oxlint.config.ts:1"),
            expect.stringContaining("src/a.ts:1"),
            expect.stringContaining(
              "`anti-slop-effect/no-throw` becomes `antislop-effect/no-throw`"
            ),
            expect.stringContaining(
              "`anti-slop/no-runtime-typeof` becomes `antislop/no-runtime-typeof`"
            ),
          ])
        )
        expect(finding?.currentState.split("\n")).toHaveLength(6)
        expect(files.read("oxlint.config.ts")).toBe(config)
        expect(files.read("src/a.ts")).toBe(source)

        files.write("oxlint.config.ts", config.replaceAll("anti-slop", "antislop"))
        files.write("shared.ts", shared.replaceAll("anti-slop", "antislop"))
        files.write("packages/app/oxlint.config.ts", nested.replaceAll("anti-slop", "antislop"))
        files.write("src/a.ts", source.replaceAll("anti-slop", "antislop"))

        const after = yield* assess()
        expect(after.findings?.some((entry) => entry.id === "antislop-rule-migration")).toBe(false)
      })
    )

    it.effect("report the retired node preset import without changing the project", () =>
      Effect.gen(function* () {
        const config = toOxlintTsConfigContent(["strict"]).replaceAll(
          "adamantite/lint/strict",
          "adamantite/lint/node"
        )

        const manifest = makePackageJson({
          devDependencies: { oxlint: oxlint.version },
          scripts: { check: "adamantite check" },
        })

        const files = makeFiles({ "oxlint.config.ts": config, "package.json": manifest })

        expect(yield* runAssess(files)).toMatchObject({
          applicable: true,
          findings: [
            {
              currentState: expect.stringContaining("adamantite/lint/node"),
              goal: expect.arrayContaining([
                expect.stringContaining("Remove `adamantite/lint/node`"),
                expect.stringContaining("node/*"),
              ]),
              id: "node-preset-migration",
              integration: "oxlint",
            },
          ],
        })
        expect(files.read("oxlint.config.ts")).toBe(config)
        expect(files.read("package.json")).toBe(manifest)
      })
    )

    it.effect("report the removed shadcn preset import without changing the project", () =>
      Effect.gen(function* () {
        const config = toOxlintTsConfigContent(["tailwind"]).replaceAll(
          "adamantite/lint/tailwind",
          "adamantite/lint/shadcn"
        )

        const manifest = makePackageJson({
          devDependencies: { oxlint: oxlint.version },
          scripts: { check: "adamantite check" },
        })

        const files = makeFiles({ "oxlint.config.ts": config, "package.json": manifest })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              currentState: expect.stringContaining("adamantite/lint/shadcn"),
              goal: expect.arrayContaining([
                expect.stringContaining("adamantite/lint/tailwind"),
                expect.stringContaining("shadcn/*"),
                expect.stringContaining("settings.shadcn"),
              ]),
              id: "tailwind-preset-migration",
              integration: "oxlint",
            },
          ],
        })
        expect(files.read("oxlint.config.ts")).toBe(config)
        expect(files.read("package.json")).toBe(manifest)
      })
    )

    it.effect("report the retired antislop preset import without changing the project", () =>
      Effect.gen(function* () {
        const config = toOxlintTsConfigContent(["strict"]).replaceAll(
          "adamantite/lint/strict",
          "adamantite/lint/antislop"
        )

        const manifest = makePackageJson({
          devDependencies: { oxlint: oxlint.version },
          scripts: { check: "adamantite check" },
        })

        const files = makeFiles({ "oxlint.config.ts": config, "package.json": manifest })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              currentState: expect.stringContaining("adamantite/lint/antislop"),
              goal: expect.arrayContaining([
                expect.stringContaining("adamantite/lint/strict"),
                expect.stringContaining("antislop/*"),
                expect.stringContaining(
                  "Move a project setting for these three rules into an `overrides` entry"
                ),
              ]),
              id: "strict-preset-migration",
              integration: "oxlint",
            },
          ],
        })
        expect(files.read("oxlint.config.ts")).toBe(config)
        expect(files.read("package.json")).toBe(manifest)
      })
    )

    it.effect(
      "report a preset that comes before core in extends without changing the project",
      () =>
        Effect.gen(function* () {
          const config = toOxlintTsConfigContent(["strict"]).replace(
            "extends: [core, strict, custom()]",
            "extends: [strict, core, custom()]"
          )

          const manifest = makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          })

          const files = makeFiles({ "oxlint.config.ts": config, "package.json": manifest })

          const result = yield* runAssess(files)

          expect(config).toContain("extends: [strict, core, custom()]")
          expect(result).toMatchObject({
            applicable: true,
            findings: [
              {
                currentState:
                  "`oxlint.config.ts` lists `strict` before the core preset `core` in `extends`.",
                goal: expect.arrayContaining([
                  "Move `core` to the position directly before `strict`, the first Adamantite preset in the `extends` array. Keep one `core` entry, and keep the order of the other entries.",
                ]),
                id: "core-preset-order",
                integration: "oxlint",
              },
            ],
          })
          expect(files.read("oxlint.config.ts")).toBe(config)
          expect(files.read("package.json")).toBe(manifest)
        })
    )

    it.effect(
      "report the jest and vitest presets together in extends without changing the project",
      () =>
        Effect.gen(function* () {
          const config = toOxlintTsConfigContent(["jest", "vitest"])

          const manifest = makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          })

          const files = makeFiles({ "oxlint.config.ts": config, "package.json": manifest })

          const result = yield* runAssess(files)

          expect(result).toMatchObject({
            applicable: true,
            findings: [
              {
                currentState:
                  "`oxlint.config.ts` extends the `jest` and `vitest` presets, which report the same defects. Each defect gets two reports.",
                id: "excluded-presets",
                integration: "oxlint",
              },
            ],
          })
          expect(files.read("oxlint.config.ts")).toBe(config)
          expect(files.read("package.json")).toBe(manifest)
        })
    )

    it.effect("report no finding when the jest and vitest presets are only in overrides", () =>
      Effect.gen(function* () {
        const config = toOxlintTsConfigContent()
          .replace(
            'import core from "adamantite/lint"',
            [
              'import core from "adamantite/lint"',
              'import jest from "adamantite/lint/jest"',
              'import vitest from "adamantite/lint/vitest"',
            ].join("\n")
          )
          .replace(
            "  ignorePatterns: core.ignorePatterns,",
            [
              "  ignorePatterns: core.ignorePatterns,",
              "  overrides: [",
              '    { files: ["jest/**/*.test.ts"], plugins: jest.plugins, rules: { ...jest.rules } },',
              '    { files: ["vitest/**/*.test.ts"], plugins: vitest.plugins, rules: { ...vitest.rules } },',
              "  ],",
            ].join("\n")
          )

        const files = makeFiles({
          "oxlint.config.ts": config,
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        expect(config).toContain("plugins: vitest.plugins")
        expect(yield* runAssess(files)).toMatchObject({ applicable: true, findings: [] })
      })
    )

    it.effect("report no finding when core is the first entry of extends", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": toOxlintTsConfigContent(["effect", "strict"]),
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        expect(yield* runAssess(files)).toMatchObject({ applicable: true, findings: [] })
      })
    )

    it.effect("report no migration for the tailwind preset or an old import in a comment", () =>
      Effect.gen(function* () {
        const config = [
          '// Previously imported "adamantite/lint/shadcn".',
          toOxlintTsConfigContent(["tailwind"]),
        ].join("\n")

        const files = makeFiles({
          "oxlint.config.ts": config,
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        expect(yield* runAssess(files)).toMatchObject({ applicable: true, findings: [] })
      })
    )

    it.effect("report not applicable when no managed lint script exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({ devDependencies: { oxlint: oxlint.version } }),
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({
          applicable: false,
        })
      })
    )

    it.effect("report missing managed config when the managed check script exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [{ id: "missing-oxlint-config" }],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("report a finding when a legacy config is active", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ".oxlintrc.json": yield* formatJson({ rules: { semi: "error" } }),
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [{ id: "legacy-oxlint-config" }],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("report healthy when package and managed config are present", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": [
            'import { defineConfig } from "oxlint"',
            'import core from "adamantite/lint"',
            "",
            "export default defineConfig({",
            '  options: { "respectEslintDisableDirectives": true, "typeAware": true, "typeCheck": true },',
            "  extends: [core],",
            "})",
            "",
          ].join("\n"),
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("report a config update when managed check config lacks type-aware options", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": [
            'import { defineConfig } from "oxlint"',
            'import core from "adamantite/lint"',
            "",
            "export default defineConfig({",
            "  extends: [core],",
            "})",
            "",
          ].join("\n"),
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              goal: [expect.stringContaining("Set `respectEslintDisableDirectives`")],
              id: "invalid-oxlint-config",
            },
          ],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("ask to export an object literal when the config exports a variable", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": [
            'import { defineConfig } from "oxlint"',
            'import core from "adamantite/lint"',
            "",
            "const config = defineConfig({",
            "  extends: [core],",
            "  options: { respectEslintDisableDirectives: true, typeAware: true, typeCheck: true },",
            "})",
            "",
            "export default config",
            "",
          ].join("\n"),
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result.findings).toMatchObject([
          {
            goal: [expect.stringContaining("Export the config object literal")],
            id: "invalid-oxlint-config",
          },
        ])
      })
    )
  })
})
