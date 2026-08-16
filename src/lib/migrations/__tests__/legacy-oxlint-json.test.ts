import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import migrationLegacyOxlintJson from "#lib/migrations/legacy-oxlint-json.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("legacyOxlintJson", () => {
  it.effect("check warns when both config formats exist and keeps the TS config active", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".oxlintrc.json": "{}\n",
        "oxlint.config.ts": "export default {}\n",
      })

      const result = yield* migrationLegacyOxlintJson.check({ cwd: ROOT }).pipe(provideFiles(files))

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
      })

      const checkResult = yield* migrationLegacyOxlintJson
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))
      expect(checkResult).toEqual({
        status: "needed",
        summary: "Migrating legacy `.oxlintrc.json` configuration to `oxlint.config.ts`.",
        warnings: [],
      })
      yield* migrationLegacyOxlintJson.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      expect(files.exists("oxlint.config.ts")).toBe(true)
      expect(files.exists(".oxlintrc.json")).toBe(false)

      const content = files.read("oxlint.config.ts")
      expect(content).toContain('"semi": "error"')
      expect(content).toContain('"respectEslintDisableDirectives": true')
      expect(content).toContain('"typeAware": true')
      expect(content).toContain('"typeCheck": true')
      expect(content).toContain("ignorePatterns: core.ignorePatterns")
      yield* migrationLegacyOxlintJson.validate({ cwd: ROOT }).pipe(provideFiles(files))
    })
  )

  it.effect("migrate hoists legacy ignore patterns alongside the core preset's patterns", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".oxlintrc.json": JSON.stringify(
          {
            ignorePatterns: ["**/node_modules", "vendor/**"],
          },
          null,
          2
        ),
      })

      yield* migrationLegacyOxlintJson.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      const content = files.read("oxlint.config.ts")
      expect(content).toContain('ignorePatterns: [...core.ignorePatterns, "vendor/**"]')
    })
  )

  it.effect("migrate converts Adamantite preset paths with and without a dot prefix", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".oxlintrc.json": JSON.stringify(
          {
            extends: [
              "node_modules/adamantite/presets/lint/react.ts",
              "./node_modules/adamantite/presets/lint/node.json",
            ],
          },
          null,
          2
        ),
      })

      yield* migrationLegacyOxlintJson.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      const content = files.read("oxlint.config.ts")
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
      const files = makeFiles()
      // A directory at the legacy config path makes the read fail while `exists` still reports it.
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        yield* fs.makeDirectory(".oxlintrc.json", { recursive: true })
      }).pipe(provideFiles(files))

      const result = yield* migrationLegacyOxlintJson
        .migrate({ cwd: ROOT })
        .pipe(Effect.result, provideFiles(files))

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })
  )

  it.effect("migrate fails when the legacy config is not a JSON object", () =>
    Effect.gen(function* () {
      const files = makeFiles({ ".oxlintrc.json": "[]" })

      const result = yield* migrationLegacyOxlintJson
        .migrate({ cwd: ROOT })
        .pipe(Effect.result, provideFiles(files))

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "InvalidConfigFormat" })
      }
    })
  )
})
