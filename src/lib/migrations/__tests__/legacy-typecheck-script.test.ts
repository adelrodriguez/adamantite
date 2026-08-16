import type { TsConfigJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { createDependencyInstallerTestContext } from "#commands/__tests__/command-test-helpers.ts"
import migrationLegacyOxlintJson from "#lib/migrations/legacy-oxlint-json.ts"
import migrationLegacyTypecheckScript from "#lib/migrations/legacy-typecheck-script.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"
import { MONOREPO_GUIDANCE } from "#lib/workspace/tsconfig.ts"

const ROOT = "/project"

const LEGACY_TYPECHECK_PACKAGE_JSON = JSON.stringify(
  {
    name: "test-project",
    scripts: {
      typecheck: "adamantite typecheck",
    },
    version: "1.0.0",
  },
  null,
  2
)

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideServices(files: FileSystemTestContext) {
  const base = Layer.mergeAll(files.layer, Path.layer)

  return Effect.provide(
    Layer.mergeAll(
      base,
      NodeVersionResolver.layer.pipe(Layer.provide(base)),
      createDependencyInstallerTestContext().layer
    )
  )
}

describe("legacyTypecheckScript", () => {
  it.effect("check reports that the legacy typecheck script needs migration", () =>
    Effect.gen(function* () {
      const files = makeFiles({ "package.json": LEGACY_TYPECHECK_PACKAGE_JSON })

      const result = yield* migrationLegacyTypecheckScript
        .check({ cwd: ROOT })
        .pipe(provideServices(files))

      expect(result).toEqual({
        status: "needed",
        summary:
          "Migrating `typecheck` to `check` so oxlint handles linting and type diagnostics together.",
        warnings: [],
      })
    })
  )

  it.effect(
    "migrate replaces the legacy typecheck script and bootstraps the current config state",
    () =>
      Effect.gen(function* () {
        const files = makeFiles({ "package.json": LEGACY_TYPECHECK_PACKAGE_JSON })

        const checkResult = yield* migrationLegacyTypecheckScript
          .check({ cwd: ROOT })
          .pipe(provideServices(files))
        expect(checkResult).toMatchObject({
          status: "needed",
          summary:
            "Migrating `typecheck` to `check` so oxlint handles linting and type diagnostics together.",
        })
        yield* migrationLegacyTypecheckScript.migrate({ cwd: ROOT }).pipe(provideServices(files))

        // SAFETY: the test seeds package.json above with only a string-valued scripts map, and the migration only rewrites those scripts.
        const packageJson = JSON.parse(files.read("package.json")) as {
          scripts?: Record<string, string>
        }
        expect(packageJson.scripts).toEqual({
          check: "adamantite check",
        })
        expect(files.exists("oxlint.config.ts")).toBe(true)
        expect(files.exists("tsconfig.json")).toBe(true)
        yield* migrationLegacyTypecheckScript.validate({ cwd: ROOT }).pipe(provideServices(files))
      })
  )

  it.effect("migrate updates an existing oxlint config to the latest supported shape", () =>
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
        "package.json": LEGACY_TYPECHECK_PACKAGE_JSON,
        "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }, null, 2),
      })

      yield* migrationLegacyTypecheckScript.migrate({ cwd: ROOT }).pipe(provideServices(files))

      const oxlintConfig = files.read("oxlint.config.ts")
      // SAFETY: the test seeds tsconfig.json above with standard tsconfig fields, and the migration only merges more of them.
      const tsconfig = JSON.parse(files.read("tsconfig.json")) as TsConfigJson

      expect(oxlintConfig).toContain("respectEslintDisableDirectives")
      expect(oxlintConfig).toContain("typeAware")
      expect(oxlintConfig).toContain("typeCheck")
      expect(tsconfig.compilerOptions).toEqual({ strict: true })
      expect(tsconfig.extends).toBe("adamantite/typescript")
    })
  )

  it.effect("migrate preserves an already migrated oxlint config", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".oxlintrc.json": JSON.stringify(
          {
            rules: {
              semi: "error",
            },
          },
          null,
          2
        ),
        "package.json": LEGACY_TYPECHECK_PACKAGE_JSON,
        "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }, null, 2),
      })

      yield* migrationLegacyOxlintJson.migrate({ cwd: ROOT }).pipe(provideServices(files))
      const migratedOxlintConfig = files.read("oxlint.config.ts")
      yield* migrationLegacyTypecheckScript.migrate({ cwd: ROOT }).pipe(provideServices(files))

      expect(files.exists(".oxlintrc.json")).toBe(false)

      const oxlintConfig = files.read("oxlint.config.ts")
      // SAFETY: the test seeds tsconfig.json above with standard tsconfig fields, and the migration only merges more of them.
      const tsconfig = JSON.parse(files.read("tsconfig.json")) as TsConfigJson

      expect(oxlintConfig).toBe(migratedOxlintConfig)
      expect(tsconfig.compilerOptions).toEqual({ strict: true })
      expect(tsconfig.extends).toBe("adamantite/typescript")
    })
  )

  it.effect("migrate returns guidance instead of writing a root tsconfig in a monorepo", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "package.json": JSON.stringify(
          {
            name: "test-project",
            scripts: {
              typecheck: "adamantite typecheck",
            },
            version: "1.0.0",
            workspaces: ["packages/*"],
          },
          null,
          2
        ),
      })

      const result = yield* migrationLegacyTypecheckScript
        .migrate({ cwd: ROOT })
        .pipe(provideServices(files))

      expect(files.exists("tsconfig.json")).toBe(false)
      expect(result.warnings).toEqual([...MONOREPO_GUIDANCE])
      yield* migrationLegacyTypecheckScript.validate({ cwd: ROOT }).pipe(provideServices(files))
    })
  )

  it.effect("migrate leaves an existing root tsconfig unchanged in a monorepo", () =>
    Effect.gen(function* () {
      const existingTsconfig = JSON.stringify(
        {
          extends: "./tooling/tsconfig.base.json",
          files: [],
          references: [{ path: "packages/app" }],
        },
        null,
        2
      )
      const files = makeFiles({
        "package.json": LEGACY_TYPECHECK_PACKAGE_JSON,
        "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
        "tsconfig.json": existingTsconfig,
      })

      yield* migrationLegacyTypecheckScript.migrate({ cwd: ROOT }).pipe(provideServices(files))

      expect(files.read("tsconfig.json")).toBe(existingTsconfig)
      yield* migrationLegacyTypecheckScript.validate({ cwd: ROOT }).pipe(provideServices(files))
    })
  )

  it.effect("migrate updates the GitHub Actions workflow when it exists", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".github/workflows/adamantite.yml":
          "name: adamantite\njobs:\n  verify:\n    strategy:\n      matrix:\n        include:\n          - name: check\n            command: bun run check\n          - name: types\n            command: bun run typecheck\n",
        "oxlint.config.ts": "export default {}\n",
        "package.json": JSON.stringify(
          {
            name: "test-project",
            scripts: {
              format: "adamantite format",
              typecheck: "adamantite typecheck",
            },
            version: "1.0.0",
          },
          null,
          2
        ),
        "tsconfig.json": JSON.stringify({ extends: "adamantite/typescript" }, null, 2),
      })

      yield* migrationLegacyTypecheckScript.migrate({ cwd: ROOT }).pipe(provideServices(files))

      const workflow = files.read(".github/workflows/adamantite.yml")
      expect(workflow).toContain("name: check")
      expect(workflow).toContain("name: format")
      expect(workflow).not.toContain("name: types")
    })
  )
})
