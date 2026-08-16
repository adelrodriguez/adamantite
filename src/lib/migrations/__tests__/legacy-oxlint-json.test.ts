import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import migrationLegacyOxlintJson from "#lib/migrations/legacy-oxlint-json.ts"

function runTestEffect<A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) {
  const provided = effect.pipe(Effect.provide(NodeServices.layer))
  return provided
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

  it.effect("check warns when both config formats exist and keeps the TS config active", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile("oxlint.config.ts", "export default {}\n"))
      yield* Effect.promise(() => writeFile(".oxlintrc.json", "{}\n"))

      const result = yield* runTestEffect(migrationLegacyOxlintJson.check({ cwd: tempDir }))

      expect(result).toEqual({
        status: "not-applicable",
        warnings: [
          "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`.",
        ],
      })
    })
  )

  it.effect("migrate converts a legacy JSON config into the current TS config format", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(
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
      )

      const checkResult = yield* runTestEffect(migrationLegacyOxlintJson.check({ cwd: tempDir }))
      expect(checkResult).toEqual({
        status: "needed",
        summary: "Migrating legacy `.oxlintrc.json` configuration to `oxlint.config.ts`.",
        warnings: [],
      })
      yield* runTestEffect(migrationLegacyOxlintJson.migrate({ cwd: tempDir }))

      expect(yield* Effect.promise(() => testFile("oxlint.config.ts").exists())).toBe(true)
      expect(yield* Effect.promise(() => testFile(".oxlintrc.json").exists())).toBe(false)

      const content = yield* Effect.promise(() => testFile("oxlint.config.ts").text())
      expect(content).toContain('"semi": "error"')
      expect(content).toContain('"respectEslintDisableDirectives": true')
      expect(content).toContain('"typeAware": true')
      expect(content).toContain('"typeCheck": true')
      expect(content).toContain("ignorePatterns: core.ignorePatterns")
      yield* runTestEffect(migrationLegacyOxlintJson.validate({ cwd: tempDir }))
    })
  )

  it.effect("migrate hoists legacy ignore patterns alongside the core preset's patterns", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(
          ".oxlintrc.json",
          JSON.stringify(
            {
              ignorePatterns: ["**/node_modules", "vendor/**"],
            },
            null,
            2
          )
        )
      )
      yield* runTestEffect(migrationLegacyOxlintJson.migrate({ cwd: tempDir }))

      const content = yield* Effect.promise(() => testFile("oxlint.config.ts").text())
      expect(content).toContain('ignorePatterns: [...core.ignorePatterns, "vendor/**"]')
    })
  )

  it.effect("migrate converts Adamantite preset paths with and without a dot prefix", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(
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
      )
      yield* runTestEffect(migrationLegacyOxlintJson.migrate({ cwd: tempDir }))

      const content = yield* Effect.promise(() => testFile("oxlint.config.ts").text())
      expect(content).toContain('import core from "adamantite/lint"')
      expect(content).toContain('import react from "adamantite/lint/react"')
      expect(content).toContain('import node from "adamantite/lint/node"')
      expect(content).toContain('"respectEslintDisableDirectives": true')
      expect(content).toContain('"typeAware": true')
      expect(content).toContain('"typeCheck": true')
      expect(content).not.toContain("node_modules/adamantite/presets/lint/react.ts")
    })
  )

  it.effect("migrate fails when reading the legacy config fails", () =>
    Effect.gen(function* () {
      mkdirSync(".oxlintrc.json", { recursive: true })

      const result = yield* runTestEffect(
        migrationLegacyOxlintJson.migrate({ cwd: tempDir }).pipe(Effect.result)
      )

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })
  )

  it.effect("migrate fails when the legacy config is not a JSON object", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile(".oxlintrc.json", "[]"))

      const result = yield* runTestEffect(
        migrationLegacyOxlintJson.migrate({ cwd: tempDir }).pipe(Effect.result)
      )

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "InvalidConfigFormat" })
      }
    })
  )
})
