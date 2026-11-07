import process from "node:process"
import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { formatJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  const target = `${process.platform}-${process.arch}${process.platform === "linux" ? "-gnu" : process.platform === "win32" ? "-msvc" : ""}`
  return createFileSystemTestContext({
    files: {
      "/usr/bin/ldd": "GNU libc",
      [`node_modules/oxlint/dist/oxlint.${target}.node`]: "",
      ...files,
    },
    root: ROOT,
  })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([
    files.layer,
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

    it.effect("give read-only migration instructions for old maps in a shared config", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": 'export { default } from "./tooling/lint.ts"\n',
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
          "tooling/lint.ts": `export default {
  rules: {
    "adamantite/layers": ["error", {
      root: "src/lib",
      layers: { shared: [], workspace: ["shared"] },
      ignore: ["**/__tests__/**"],
    }],
  },
}\n`,
        })
        const before = files.list().map((file) => [file, files.read(file)])
        const result = yield* runAssess(files)

        expect(result.applicable).toBe(true)

        if (result.applicable) {
          const finding = result.findings.find((item) => item.id === "layers-map-migration")

          expect(finding).toMatchObject({
            currentState: expect.stringContaining("tooling/lint.ts"),
            goal: expect.arrayContaining([
              expect.stringContaining("imports"),
              expect.stringContaining("Preserve"),
              expect.stringContaining("adamantite check"),
            ]),
            integration: "oxlint",
          })
        }

        expect(files.list().map((file) => [file, files.read(file)])).toStrictEqual(before)
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
          findings: [{ id: "invalid-oxlint-config" }],
          packageActions: [],
          warnings: [],
        })
      })
    )
  })
})
