import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import migrationLegacyKnipJson from "#lib/migrations/legacy-knip-json.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("legacyKnipJson", () => {
  it.effect("check warns when both config formats exist and keeps the TS config active", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "knip.config.ts": "export default {}\n",
        "knip.json": "{}\n",
      })

      const result = yield* migrationLegacyKnipJson.check({ cwd: ROOT }).pipe(provideFiles(files))

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
      const files = makeFiles({
        "knip.json": "{}\n",
        "knip.jsonc": '{ "entry": ["src/index.ts"] }\n',
      })

      const result = yield* migrationLegacyKnipJson.check({ cwd: ROOT }).pipe(provideFiles(files))

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
        const files = makeFiles({
          "knip.json": '{ "entry": ["src/other.ts"] }\n',
          "knip.jsonc": JSON.stringify(
            {
              entry: ["src/index.ts"],
              ignore: ["bunup.config.ts"],
            },
            null,
            2
          ),
        })

        yield* migrationLegacyKnipJson.migrate({ cwd: ROOT }).pipe(provideFiles(files))

        expect(files.exists("knip.config.ts")).toBe(true)
        expect(files.exists("knip.json")).toBe(false)
        expect(files.exists("knip.jsonc")).toBe(false)

        const content = files.read("knip.config.ts")
        expect(content).toContain('"src/index.ts"')
        expect(content).not.toContain("src/other.ts")
      })
  )

  it.effect("migrate converts a legacy JSON config into the current TS config format", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "knip.json": JSON.stringify(
          {
            entry: ["src/main.ts"],
            ignore: ["bunup.config.ts"],
            rules: {
              devDependencies: "off",
            },
          },
          null,
          2
        ),
      })

      const checkResult = yield* migrationLegacyKnipJson
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))
      expect(checkResult).toEqual({
        status: "needed",
        summary: "Migrating legacy `knip.json` configuration to `knip.config.ts`.",
        warnings: [],
      })
      yield* migrationLegacyKnipJson.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      expect(files.exists("knip.config.ts")).toBe(true)
      expect(files.exists("knip.json")).toBe(false)

      const content = files.read("knip.config.ts")
      expect(content).toContain('import analyze from "adamantite/analyze"')
      expect(content).toContain("  ...analyze,")
      expect(content).toContain("    ...analyze.rules,")
      expect(content).toContain("entry: [")
      expect(content).toContain('"src/main.ts"')
      expect(content).toContain('"bunup.config.ts"')
      expect(content).toContain('devDependencies: "off"')
      yield* migrationLegacyKnipJson.validate({ cwd: ROOT }).pipe(provideFiles(files))
    })
  )

  it.effect("migrate converts a legacy JSONC config with comments and trailing commas", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "knip.jsonc": [
          "{",
          "  // preserve semantic override",
          '  "entry": ["src/index.ts"],',
          '  "ignore": ["bunup.config.ts"],',
          "}",
          "",
        ].join("\n"),
      })

      const checkResult = yield* migrationLegacyKnipJson
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))
      expect(checkResult).toEqual({
        status: "needed",
        summary: "Migrating legacy `knip.jsonc` configuration to `knip.config.ts`.",
        warnings: [],
      })
      yield* migrationLegacyKnipJson.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      expect(files.exists("knip.config.ts")).toBe(true)
      expect(files.exists("knip.jsonc")).toBe(false)

      const content = files.read("knip.config.ts")
      expect(content).toContain('"src/index.ts"')
      expect(content).toContain('"bunup.config.ts"')
    })
  )
})
