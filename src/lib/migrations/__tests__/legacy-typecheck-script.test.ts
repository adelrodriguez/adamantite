import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TsConfigJson } from "type-fest"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, test } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import { createDependencyInstallerTestContext } from "#commands/__tests__/command-test-helpers.ts"
import migrationLegacyOxlintJson from "#lib/migrations/legacy-oxlint-json.ts"
import migrationLegacyTypecheckScript from "#lib/migrations/legacy-typecheck-script.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"
import { MONOREPO_GUIDANCE } from "#lib/workspace/tsconfig.ts"

function runTestEffect<A, E>(
  effect: Effect.Effect<A, E, DependencyInstaller | NodeServices.NodeServices | NodeVersionResolver>
) {
  const dependencyInstallerContext = createDependencyInstallerTestContext()
  const provided = effect.pipe(
    Effect.provide(
      Layer.mergeAll(
        NodeServices.layer,
        NodeVersionResolver.layer.pipe(Layer.provide(NodeServices.layer)),
        dependencyInstallerContext.layer
      )
    )
  )
  return Effect.runPromise(provided)
}

describe("legacyTypecheckScript", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-legacy-typecheck-migration-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  test("check reports that the legacy typecheck script needs migration", async () => {
    await writeFile(
      "package.json",
      JSON.stringify(
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
    )

    const result = await runTestEffect(migrationLegacyTypecheckScript.check({ cwd: tempDir }))

    expect(result).toEqual({
      status: "needed",
      summary:
        "Migrating `typecheck` to `check` so oxlint handles linting and type diagnostics together.",
      warnings: [],
    })
  })

  test("migrate replaces the legacy typecheck script and bootstraps the current config state", async () => {
    await writeFile(
      "package.json",
      JSON.stringify(
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
    )

    const checkResult = await runTestEffect(migrationLegacyTypecheckScript.check({ cwd: tempDir }))
    expect(checkResult).toMatchObject({
      status: "needed",
      summary:
        "Migrating `typecheck` to `check` so oxlint handles linting and type diagnostics together.",
    })

    await runTestEffect(migrationLegacyTypecheckScript.migrate({ cwd: tempDir }))

    // SAFETY: the test seeds package.json above with only a string-valued scripts map, and the migration only rewrites those scripts.
    const packageJson = JSON.parse(await testFile("package.json").text()) as {
      scripts?: Record<string, string>
    }
    expect(packageJson.scripts).toEqual({
      check: "adamantite check",
    })
    expect(await testFile("oxlint.config.ts").exists()).toBe(true)
    expect(await testFile("tsconfig.json").exists()).toBe(true)

    await runTestEffect(migrationLegacyTypecheckScript.validate({ cwd: tempDir }))
  })

  test("migrate updates an existing oxlint config to the latest supported shape", async () => {
    await writeFile(
      "package.json",
      JSON.stringify(
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
    )
    await writeFile(
      "oxlint.config.ts",
      [
        'import { defineConfig } from "oxlint"',
        'import core from "adamantite/lint"',
        "",
        "export default defineConfig({",
        "  extends: [core],",
        "})",
        "",
      ].join("\n")
    )
    await writeFile("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }, null, 2))

    await runTestEffect(migrationLegacyTypecheckScript.migrate({ cwd: tempDir }))

    const oxlintConfig = await testFile("oxlint.config.ts").text()
    // SAFETY: the test seeds tsconfig.json above with standard tsconfig fields, and the migration only merges more of them.
    const tsconfig = JSON.parse(await testFile("tsconfig.json").text()) as TsConfigJson

    expect(oxlintConfig).toContain("respectEslintDisableDirectives")
    expect(oxlintConfig).toContain("typeAware")
    expect(oxlintConfig).toContain("typeCheck")
    expect(tsconfig.compilerOptions).toEqual({ strict: true })
    expect(tsconfig.extends).toBe("adamantite/typescript")
  })

  test("migrate preserves an already migrated oxlint config", async () => {
    await writeFile(
      "package.json",
      JSON.stringify(
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
    )
    await writeFile(
      ".oxlintrc.json",
      JSON.stringify(
        {
          rules: {
            semi: "error",
          },
        },
        null,
        2
      )
    )
    await writeFile("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }, null, 2))

    await runTestEffect(migrationLegacyOxlintJson.migrate({ cwd: tempDir }))
    const migratedOxlintConfig = await testFile("oxlint.config.ts").text()

    await runTestEffect(migrationLegacyTypecheckScript.migrate({ cwd: tempDir }))

    expect(await testFile(".oxlintrc.json").exists()).toBe(false)

    const oxlintConfig = await testFile("oxlint.config.ts").text()
    // SAFETY: the test seeds tsconfig.json above with standard tsconfig fields, and the migration only merges more of them.
    const tsconfig = JSON.parse(await testFile("tsconfig.json").text()) as TsConfigJson

    expect(oxlintConfig).toBe(migratedOxlintConfig)
    expect(tsconfig.compilerOptions).toEqual({ strict: true })
    expect(tsconfig.extends).toBe("adamantite/typescript")
  })

  test("migrate returns guidance instead of writing a root tsconfig in a monorepo", async () => {
    await writeFile(
      "package.json",
      JSON.stringify(
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
      )
    )

    const result = await runTestEffect(migrationLegacyTypecheckScript.migrate({ cwd: tempDir }))

    expect(await testFile("tsconfig.json").exists()).toBe(false)
    expect(result.warnings).toEqual([...MONOREPO_GUIDANCE])

    await runTestEffect(migrationLegacyTypecheckScript.validate({ cwd: tempDir }))
  })

  test("migrate leaves an existing root tsconfig unchanged in a monorepo", async () => {
    await writeFile(
      "package.json",
      JSON.stringify(
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
    )
    await writeFile("pnpm-workspace.yaml", "packages:\n  - packages/*\n")
    const existingTsconfig = JSON.stringify(
      {
        extends: "./tooling/tsconfig.base.json",
        files: [],
        references: [{ path: "packages/app" }],
      },
      null,
      2
    )
    await writeFile("tsconfig.json", existingTsconfig)

    await runTestEffect(migrationLegacyTypecheckScript.migrate({ cwd: tempDir }))

    expect(await testFile("tsconfig.json").text()).toBe(existingTsconfig)

    await runTestEffect(migrationLegacyTypecheckScript.validate({ cwd: tempDir }))
  })

  test("migrate updates the GitHub Actions workflow when it exists", async () => {
    await writeFile(
      "package.json",
      JSON.stringify(
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
      )
    )
    await writeFile("oxlint.config.ts", "export default {}\n")
    await writeFile("tsconfig.json", JSON.stringify({ extends: "adamantite/typescript" }, null, 2))
    mkdirSync(".github/workflows", { recursive: true })
    await writeFile(
      ".github/workflows/adamantite.yml",
      "name: adamantite\njobs:\n  verify:\n    strategy:\n      matrix:\n        include:\n          - name: check\n            command: bun run check\n          - name: types\n            command: bun run typecheck\n"
    )

    await runTestEffect(migrationLegacyTypecheckScript.migrate({ cwd: tempDir }))

    const workflow = await testFile(".github/workflows/adamantite.yml").text()
    expect(workflow).toContain("name: check")
    expect(workflow).toContain("name: format")
    expect(workflow).not.toContain("name: types")
  })
})
