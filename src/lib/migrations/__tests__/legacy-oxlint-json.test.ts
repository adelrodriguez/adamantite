import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, test } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import migrationLegacyOxlintJson from "#lib/migrations/legacy-oxlint-json.ts"

function runTestEffect<A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) {
  const provided = effect.pipe(Effect.provide(NodeServices.layer))
  return Effect.runPromise(provided)
}

describe("legacyOxlintJson", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-legacy-oxlint-migration-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  test("check warns when both config formats exist and keeps the TS config active", async () => {
    await writeFile("oxlint.config.ts", "export default {}\n")
    await writeFile(".oxlintrc.json", "{}\n")

    const result = await runTestEffect(migrationLegacyOxlintJson.check({ cwd: tempDir }))

    expect(result).toEqual({
      status: "not-applicable",
      warnings: [
        "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`.",
      ],
    })
  })

  test("migrate converts a legacy JSON config into the current TS config format", async () => {
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

    const checkResult = await runTestEffect(migrationLegacyOxlintJson.check({ cwd: tempDir }))
    expect(checkResult).toEqual({
      status: "needed",
      summary: "Migrating legacy `.oxlintrc.json` configuration to `oxlint.config.ts`.",
      warnings: [],
    })

    await runTestEffect(migrationLegacyOxlintJson.migrate({ cwd: tempDir }))

    expect(await testFile("oxlint.config.ts").exists()).toBe(true)
    expect(await testFile(".oxlintrc.json").exists()).toBe(false)

    const content = await testFile("oxlint.config.ts").text()
    expect(content).toContain('"semi": "error"')
    expect(content).toContain('"respectEslintDisableDirectives": true')
    expect(content).toContain('"typeAware": true')
    expect(content).toContain('"typeCheck": true')
    expect(content).toContain("ignorePatterns: core.ignorePatterns")

    await runTestEffect(migrationLegacyOxlintJson.validate({ cwd: tempDir }))
  })

  test("migrate hoists legacy ignore patterns alongside the core preset's patterns", async () => {
    await writeFile(
      ".oxlintrc.json",
      JSON.stringify(
        {
          ignorePatterns: ["**/node_modules", "vendor/**"],
        },
        null,
        2
      )
    )

    await runTestEffect(migrationLegacyOxlintJson.migrate({ cwd: tempDir }))

    const content = await testFile("oxlint.config.ts").text()
    expect(content).toContain('ignorePatterns: [...core.ignorePatterns, "vendor/**"]')
  })

  test("migrate converts Adamantite preset paths with and without a dot prefix", async () => {
    await writeFile(
      ".oxlintrc.json",
      JSON.stringify(
        {
          extends: [
            "node_modules/adamantite/presets/lint/react.ts",
            "./node_modules/adamantite/presets/lint/node.json",
          ],
        },
        null,
        2
      )
    )

    await runTestEffect(migrationLegacyOxlintJson.migrate({ cwd: tempDir }))

    const content = await testFile("oxlint.config.ts").text()
    expect(content).toContain('import core from "adamantite/lint"')
    expect(content).toContain('import react from "adamantite/lint/react"')
    expect(content).toContain('import node from "adamantite/lint/node"')
    expect(content).toContain('"respectEslintDisableDirectives": true')
    expect(content).toContain('"typeAware": true')
    expect(content).toContain('"typeCheck": true')
    expect(content).not.toContain("node_modules/adamantite/presets/lint/react.ts")
  })

  test("migrate fails when reading the legacy config fails", async () => {
    mkdirSync(".oxlintrc.json", { recursive: true })

    try {
      await runTestEffect(migrationLegacyOxlintJson.migrate({ cwd: tempDir }))
      throw new Error("Expected migration to fail")
    } catch (error) {
      expect(error).toMatchObject({ _tag: "FailedToReadFile" })
    }
  })

  test("migrate fails when the legacy config is not a JSON object", async () => {
    await writeFile(".oxlintrc.json", "[]")

    try {
      await runTestEffect(migrationLegacyOxlintJson.migrate({ cwd: tempDir }))
      throw new Error("Expected migration to fail")
    } catch (error) {
      expect(error).toMatchObject({ _tag: "InvalidConfigFormat" })
    }
  })
})
