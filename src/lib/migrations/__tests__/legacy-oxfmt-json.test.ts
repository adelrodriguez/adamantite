import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import migrationLegacyOxfmtJson from "#lib/migrations/legacy-oxfmt-json.ts"

function runTestEffect<A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) {
  const provided = effect.pipe(Effect.provide(NodeServices.layer))

  return provided
}

describe("legacyOxfmtJson", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-legacy-oxfmt-migration-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  it.effect("check warns when both config formats exist and keeps the TS config active", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile("oxfmt.config.ts", "export default { semi: false }\n"))
      yield* Effect.promise(() => writeFile(".oxfmtrc.json", "{}\n"))

      const result = yield* runTestEffect(migrationLegacyOxfmtJson.check({ cwd: tempDir }))

      expect(result).toEqual({
        status: "not-applicable",
        warnings: [
          "Found both `oxfmt.config.ts` and `.oxfmtrc.json(c)`. Adamantite will use `oxfmt.config.ts`.",
        ],
      })
    })
  )

  it.effect("migrate converts a legacy JSON config into the current TS config format", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(
          ".oxfmtrc.json",
          JSON.stringify(
            {
              semi: true,
              sortImports: {
                order: "desc",
              },
            },
            null,
            2
          )
        )
      )

      const checkResult = yield* runTestEffect(migrationLegacyOxfmtJson.check({ cwd: tempDir }))
      expect(checkResult).toEqual({
        status: "needed",
        summary: "Migrating legacy `.oxfmtrc.json` configuration to `oxfmt.config.ts`.",
        warnings: [],
      })
      yield* runTestEffect(migrationLegacyOxfmtJson.migrate({ cwd: tempDir }))

      expect(yield* Effect.promise(() => testFile("oxfmt.config.ts").exists())).toBe(true)
      expect(yield* Effect.promise(() => testFile(".oxfmtrc.json").exists())).toBe(false)

      const content = yield* Effect.promise(() => testFile("oxfmt.config.ts").text())
      expect(content).toContain('import format from "adamantite/format"')
      expect(content).toContain("  ...format,")
      expect(content).toContain("semi: true")
      expect(content).toContain("...format.sortImports")
      expect(content).toContain('order: "desc"')
      yield* runTestEffect(migrationLegacyOxfmtJson.validate({ cwd: tempDir }))
    })
  )

  it.effect("check warns when both legacy JSON and JSONC exist without a TS config", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile(".oxfmtrc.json", "{}\n"))
      yield* Effect.promise(() => writeFile(".oxfmtrc.jsonc", '{ "semi": true }\n'))

      const result = yield* runTestEffect(migrationLegacyOxfmtJson.check({ cwd: tempDir }))

      expect(result).toEqual({
        status: "needed",
        summary: "Migrating legacy `.oxfmtrc.jsonc` configuration to `oxfmt.config.ts`.",
        warnings: [
          "Found both `.oxfmtrc.json` and `.oxfmtrc.jsonc`. Multiple legacy oxfmt configs exist; Adamantite will treat `.oxfmtrc.jsonc` as the source of truth when migration is needed.",
        ],
      })
    })
  )

  it.effect(
    "migrate removes both legacy files when JSON and JSONC exist without oxfmt.config.ts",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeFile(".oxfmtrc.json", '{ "semi": false }\n'))
        yield* Effect.promise(() =>
          writeFile(
            ".oxfmtrc.jsonc",
            JSON.stringify(
              {
                semi: true,
              },
              null,
              2
            )
          )
        )
        yield* runTestEffect(migrationLegacyOxfmtJson.migrate({ cwd: tempDir }))

        expect(yield* Effect.promise(() => testFile("oxfmt.config.ts").exists())).toBe(true)
        expect(yield* Effect.promise(() => testFile(".oxfmtrc.json").exists())).toBe(false)
        expect(yield* Effect.promise(() => testFile(".oxfmtrc.jsonc").exists())).toBe(false)

        const content = yield* Effect.promise(() => testFile("oxfmt.config.ts").text())
        expect(content).toContain("semi: true")
      })
  )

  it.effect("migrate converts a legacy JSONC config with comments and trailing commas", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(
          ".oxfmtrc.jsonc",
          [
            "{",
            "  // preserve me semantically",
            '  "semi": true,',
            '  "singleQuote": true,',
            "}",
            "",
          ].join("\n")
        )
      )

      const checkResult = yield* runTestEffect(migrationLegacyOxfmtJson.check({ cwd: tempDir }))
      expect(checkResult).toEqual({
        status: "needed",
        summary: "Migrating legacy `.oxfmtrc.jsonc` configuration to `oxfmt.config.ts`.",
        warnings: [],
      })
      yield* runTestEffect(migrationLegacyOxfmtJson.migrate({ cwd: tempDir }))

      expect(yield* Effect.promise(() => testFile("oxfmt.config.ts").exists())).toBe(true)
      expect(yield* Effect.promise(() => testFile(".oxfmtrc.jsonc").exists())).toBe(false)

      const content = yield* Effect.promise(() => testFile("oxfmt.config.ts").text())
      expect(content).toContain("semi: true")
      expect(content).toContain("singleQuote: true")
    })
  )
})
