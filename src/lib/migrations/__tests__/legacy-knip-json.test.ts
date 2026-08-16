import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import migrationLegacyKnipJson from "#lib/migrations/legacy-knip-json.ts"

function runTestEffect<A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) {
  const provided = effect.pipe(Effect.provide(NodeServices.layer))

  return provided
}

describe("legacyKnipJson", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-legacy-knip-migration-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  it.effect("check warns when both config formats exist and keeps the TS config active", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile("knip.config.ts", "export default {}\n"))
      yield* Effect.promise(() => writeFile("knip.json", "{}\n"))

      const result = yield* runTestEffect(migrationLegacyKnipJson.check({ cwd: tempDir }))

      expect(result).toEqual({
        status: "not-applicable",
        warnings: [
          "Found both `knip.config.ts` and `knip.json(c)`. Adamantite will use `knip.config.ts`.",
        ],
      })
    })
  )

  it.effect("check warns when both legacy JSON and JSONC exist without a TS config", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile("knip.json", "{}\n"))
      yield* Effect.promise(() => writeFile("knip.jsonc", '{ "entry": ["src/index.ts"] }\n'))

      const result = yield* runTestEffect(migrationLegacyKnipJson.check({ cwd: tempDir }))

      expect(result).toEqual({
        status: "needed",
        summary: "Migrating legacy `knip.jsonc` configuration to `knip.config.ts`.",
        warnings: [
          "Found both `knip.json` and `knip.jsonc`. Multiple legacy knip configs exist; Adamantite will treat `knip.jsonc` as the source of truth when migration is needed.",
        ],
      })
    })
  )

  it.effect(
    "migrate removes both legacy files when JSON and JSONC exist without knip.config.ts",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeFile("knip.json", '{ "entry": ["src/other.ts"] }\n'))
        yield* Effect.promise(() =>
          writeFile(
            "knip.jsonc",
            JSON.stringify(
              {
                entry: ["src/index.ts"],
                ignore: ["bunup.config.ts"],
              },
              null,
              2
            )
          )
        )
        yield* runTestEffect(migrationLegacyKnipJson.migrate({ cwd: tempDir }))

        expect(yield* Effect.promise(() => testFile("knip.config.ts").exists())).toBe(true)
        expect(yield* Effect.promise(() => testFile("knip.json").exists())).toBe(false)
        expect(yield* Effect.promise(() => testFile("knip.jsonc").exists())).toBe(false)

        const content = yield* Effect.promise(() => testFile("knip.config.ts").text())
        expect(content).toContain('"src/index.ts"')
        expect(content).not.toContain("src/other.ts")
      })
  )

  it.effect("migrate converts a legacy JSON config into the current TS config format", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(
          "knip.json",
          JSON.stringify(
            {
              entry: ["src/main.ts"],
              ignore: ["bunup.config.ts"],
              rules: {
                devDependencies: "off",
              },
            },
            null,
            2
          )
        )
      )

      const checkResult = yield* runTestEffect(migrationLegacyKnipJson.check({ cwd: tempDir }))
      expect(checkResult).toEqual({
        status: "needed",
        summary: "Migrating legacy `knip.json` configuration to `knip.config.ts`.",
        warnings: [],
      })
      yield* runTestEffect(migrationLegacyKnipJson.migrate({ cwd: tempDir }))

      expect(yield* Effect.promise(() => testFile("knip.config.ts").exists())).toBe(true)
      expect(yield* Effect.promise(() => testFile("knip.json").exists())).toBe(false)

      const content = yield* Effect.promise(() => testFile("knip.config.ts").text())
      expect(content).toContain('import analyze from "adamantite/analyze"')
      expect(content).toContain("  ...analyze,")
      expect(content).toContain("    ...analyze.rules,")
      expect(content).toContain("entry: [")
      expect(content).toContain('"src/main.ts"')
      expect(content).toContain('"bunup.config.ts"')
      expect(content).toContain('devDependencies: "off"')
      yield* runTestEffect(migrationLegacyKnipJson.validate({ cwd: tempDir }))
    })
  )

  it.effect("migrate converts a legacy JSONC config with comments and trailing commas", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(
          "knip.jsonc",
          [
            "{",
            "  // preserve semantic override",
            '  "entry": ["src/index.ts"],',
            '  "ignore": ["bunup.config.ts"],',
            "}",
            "",
          ].join("\n")
        )
      )

      const checkResult = yield* runTestEffect(migrationLegacyKnipJson.check({ cwd: tempDir }))
      expect(checkResult).toEqual({
        status: "needed",
        summary: "Migrating legacy `knip.jsonc` configuration to `knip.config.ts`.",
        warnings: [],
      })
      yield* runTestEffect(migrationLegacyKnipJson.migrate({ cwd: tempDir }))

      expect(yield* Effect.promise(() => testFile("knip.config.ts").exists())).toBe(true)
      expect(yield* Effect.promise(() => testFile("knip.jsonc").exists())).toBe(false)

      const content = yield* Effect.promise(() => testFile("knip.config.ts").text())
      expect(content).toContain('"src/index.ts"')
      expect(content).toContain('"bunup.config.ts"')
    })
  )
})
