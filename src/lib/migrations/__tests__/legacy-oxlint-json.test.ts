import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { createPrompterTestContext } from "#commands/__tests__/command-test-helpers.ts"
import migrationLegacyOxlintJson from "#lib/migrations/legacy-oxlint-json.ts"

function runTestEffect<A, E, R>(effect: Effect.Effect<A, E, R>) {
  const prompterContext = createPrompterTestContext()
  const provided = effect.pipe(
    Effect.provide(Layer.merge(NodeServices.layer, prompterContext.layer))
  ) as Effect.Effect<A, E>
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
    await Bun.write("oxlint.config.ts", "export default {}\n")
    await Bun.write(".oxlintrc.json", "{}\n")

    const result = await runTestEffect(migrationLegacyOxlintJson.check({ cwd: tempDir }))

    expect(result).toEqual({
      status: "already-migrated",
      warnings: [
        "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`.",
      ],
    })
  })

  test("migrate converts a legacy JSON config into the current TS config format", async () => {
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

    const checkResult = await runTestEffect(migrationLegacyOxlintJson.check({ cwd: tempDir }))
    expect(checkResult).toEqual({
      status: "needed",
      summary: "Migrating legacy `.oxlintrc.json` configuration to `oxlint.config.ts`.",
      warnings: [],
    })

    await runTestEffect(migrationLegacyOxlintJson.migrate({ cwd: tempDir }))

    expect(await Bun.file("oxlint.config.ts").exists()).toBe(true)
    expect(await Bun.file(".oxlintrc.json").exists()).toBe(false)

    const content = await Bun.file("oxlint.config.ts").text()
    expect(content).toContain('"semi": "error"')
    expect(content).toContain('"respectEslintDisableDirectives": true')
    expect(content).toContain('"typeAware": true')
    expect(content).toContain('"typeCheck": true')

    await runTestEffect(migrationLegacyOxlintJson.validate({ cwd: tempDir }))
  })

  test("migrate converts Adamantite preset paths with and without a dot prefix", async () => {
    await Bun.write(
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

    const content = await Bun.file("oxlint.config.ts").text()
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
    await Bun.write(".oxlintrc.json", "[]")

    try {
      await runTestEffect(migrationLegacyOxlintJson.migrate({ cwd: tempDir }))
      throw new Error("Expected migration to fail")
    } catch (error) {
      expect(error).toMatchObject({ _tag: "InvalidConfigFormat" })
    }
  })
})
