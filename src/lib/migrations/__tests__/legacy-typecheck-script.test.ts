import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  createDependencyInstallerTestContext,
  createPrompterTestContext,
} from "#commands/__tests__/command-test-helpers.ts"
import migrationLegacyOxlintJson from "#lib/migrations/legacy-oxlint-json.ts"
import migrationLegacyTypecheckScript from "#lib/migrations/legacy-typecheck-script.ts"

function runTestEffect<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options?: Parameters<typeof createDependencyInstallerTestContext>[0]
) {
  const prompterContext = createPrompterTestContext()
  const dependencyInstallerContext = createDependencyInstallerTestContext(options)
  const provided = effect.pipe(
    Effect.provide(
      Layer.mergeAll(NodeServices.layer, prompterContext.layer, dependencyInstallerContext.layer)
    )
  ) as Effect.Effect<A, E>
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
    await Bun.write(
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
      applicable: true,
      summary:
        "Migrating `typecheck` to `check` so oxlint handles linting and type diagnostics together.",
      warnings: [],
    })
  })

  test("migrate replaces the legacy typecheck script and bootstraps the current config state", async () => {
    await Bun.write(
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
      applicable: true,
      summary:
        "Migrating `typecheck` to `check` so oxlint handles linting and type diagnostics together.",
    })

    await runTestEffect(migrationLegacyTypecheckScript.migrate({ cwd: tempDir }))

    const packageJson = (await Bun.file("package.json").json()) as {
      scripts?: Record<string, string>
    }
    expect(packageJson.scripts).toEqual({
      check: "adamantite check",
    })
    expect(await Bun.file("oxlint.config.ts").exists()).toBe(true)
    expect(await Bun.file("tsconfig.json").exists()).toBe(true)

    await runTestEffect(migrationLegacyTypecheckScript.validate({ cwd: tempDir }))
  })

  test("migrate updates an existing oxlint config to the latest supported shape", async () => {
    await Bun.write(
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
    await Bun.write(
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
    await Bun.write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }, null, 2))

    await runTestEffect(migrationLegacyTypecheckScript.migrate({ cwd: tempDir }))

    const oxlintConfig = await Bun.file("oxlint.config.ts").text()
    const tsconfig = (await Bun.file("tsconfig.json").json()) as {
      compilerOptions?: Record<string, unknown>
      extends?: string
    }

    expect(oxlintConfig).toContain("respectEslintDisableDirectives")
    expect(oxlintConfig).toContain("typeAware")
    expect(oxlintConfig).toContain("typeCheck")
    expect(tsconfig.compilerOptions).toEqual({ strict: true })
    expect(tsconfig.extends).toBe("adamantite/typescript")
  })

  test("migrate preserves an already migrated oxlint config", async () => {
    await Bun.write(
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
    await Bun.write(
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
    await Bun.write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }, null, 2))

    await runTestEffect(migrationLegacyOxlintJson.migrate({ cwd: tempDir }))
    const migratedOxlintConfig = await Bun.file("oxlint.config.ts").text()

    await runTestEffect(migrationLegacyTypecheckScript.migrate({ cwd: tempDir }))

    expect(await Bun.file(".oxlintrc.json").exists()).toBe(false)

    const oxlintConfig = await Bun.file("oxlint.config.ts").text()
    const tsconfig = (await Bun.file("tsconfig.json").json()) as {
      compilerOptions?: Record<string, unknown>
      extends?: string
    }

    expect(oxlintConfig).toBe(migratedOxlintConfig)
    expect(tsconfig.compilerOptions).toEqual({ strict: true })
    expect(tsconfig.extends).toBe("adamantite/typescript")
  })

  test("migrate updates the GitHub Actions workflow when it exists", async () => {
    await Bun.write(
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
    await Bun.write("oxlint.config.ts", "export default {}\n")
    await Bun.write("tsconfig.json", JSON.stringify({ extends: "adamantite/typescript" }, null, 2))
    mkdirSync(".github/workflows", { recursive: true })
    await Bun.write(
      ".github/workflows/adamantite.yml",
      "name: adamantite\njobs:\n  verify:\n    strategy:\n      matrix:\n        include:\n          - name: check\n            command: bun run check\n          - name: types\n            command: bun run typecheck\n"
    )

    await runTestEffect(migrationLegacyTypecheckScript.migrate({ cwd: tempDir }))

    const workflow = await Bun.file(".github/workflows/adamantite.yml").text()
    expect(workflow).toContain("name: check")
    expect(workflow).toContain("name: format")
    expect(workflow).not.toContain("name: types")
  })
})
