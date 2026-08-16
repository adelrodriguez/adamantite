import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import migrationLegacyOxfmtJson from "#lib/migrations/legacy-oxfmt-json.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("legacyOxfmtJson", () => {
  it.effect("check warns when both config formats exist and keeps the TS config active", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".oxfmtrc.json": "{}\n",
        "oxfmt.config.ts": "export default { semi: false }\n",
      })

      const result = yield* migrationLegacyOxfmtJson.check({ cwd: ROOT }).pipe(provideFiles(files))

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
      const files = makeFiles({
        ".oxfmtrc.json": JSON.stringify(
          {
            semi: true,
            sortImports: {
              order: "desc",
            },
          },
          null,
          2
        ),
      })

      const checkResult = yield* migrationLegacyOxfmtJson
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))
      expect(checkResult).toEqual({
        status: "needed",
        summary: "Migrating legacy `.oxfmtrc.json` configuration to `oxfmt.config.ts`.",
        warnings: [],
      })
      yield* migrationLegacyOxfmtJson.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      expect(files.exists("oxfmt.config.ts")).toBe(true)
      expect(files.exists(".oxfmtrc.json")).toBe(false)

      const content = files.read("oxfmt.config.ts")
      expect(content).toContain('import format from "adamantite/format"')
      expect(content).toContain("  ...format,")
      expect(content).toContain("semi: true")
      expect(content).toContain("...format.sortImports")
      expect(content).toContain('order: "desc"')
      yield* migrationLegacyOxfmtJson.validate({ cwd: ROOT }).pipe(provideFiles(files))
    })
  )

  it.effect("check warns when both legacy JSON and JSONC exist without a TS config", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".oxfmtrc.json": "{}\n",
        ".oxfmtrc.jsonc": '{ "semi": true }\n',
      })

      const result = yield* migrationLegacyOxfmtJson.check({ cwd: ROOT }).pipe(provideFiles(files))

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
        const files = makeFiles({
          ".oxfmtrc.json": '{ "semi": false }\n',
          ".oxfmtrc.jsonc": JSON.stringify(
            {
              semi: true,
            },
            null,
            2
          ),
        })

        yield* migrationLegacyOxfmtJson.migrate({ cwd: ROOT }).pipe(provideFiles(files))

        expect(files.exists("oxfmt.config.ts")).toBe(true)
        expect(files.exists(".oxfmtrc.json")).toBe(false)
        expect(files.exists(".oxfmtrc.jsonc")).toBe(false)

        const content = files.read("oxfmt.config.ts")
        expect(content).toContain("semi: true")
      })
  )

  it.effect("migrate converts a legacy JSONC config with comments and trailing commas", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".oxfmtrc.jsonc": [
          "{",
          "  // preserve me semantically",
          '  "semi": true,',
          '  "singleQuote": true,',
          "}",
          "",
        ].join("\n"),
      })

      const checkResult = yield* migrationLegacyOxfmtJson
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))
      expect(checkResult).toEqual({
        status: "needed",
        summary: "Migrating legacy `.oxfmtrc.jsonc` configuration to `oxfmt.config.ts`.",
        warnings: [],
      })
      yield* migrationLegacyOxfmtJson.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      expect(files.exists("oxfmt.config.ts")).toBe(true)
      expect(files.exists(".oxfmtrc.jsonc")).toBe(false)

      const content = files.read("oxfmt.config.ts")
      expect(content).toContain("semi: true")
      expect(content).toContain("singleQuote: true")
    })
  )
})
