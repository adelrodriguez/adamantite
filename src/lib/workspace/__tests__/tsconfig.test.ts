import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import tsconfig from "#lib/workspace/tsconfig.ts"

layer(NodeServices.layer)("tsconfig", (it) => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-typescript-config-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("detect", () => {
    it.effect("detect when tsconfig.json does not exist", () =>
      Effect.gen(function* () {
        const exists = yield* tsconfig.detect(tempDir)

        expect(exists).toBe(false)
      })
    )
  })

  describe("create", () => {
    it.effect("create tsconfig.json with the correct config", () =>
      Effect.gen(function* () {
        yield* tsconfig.create(tempDir)

        const exists = yield* tsconfig.detect(tempDir)
        expect(exists).toBe(true)

        const content = yield* Effect.promise(() => testFile("tsconfig.json").text())
        const config = JSON.parse(content)

        expect(config).toHaveProperty("extends")
        expect(config.extends).toBe("adamantite/typescript")
      })
    )

    it.effect("handle write failures when creating tsconfig.json", () =>
      Effect.gen(function* () {
        mkdirSync("readonly-dir", { recursive: true })
        chmodSync("readonly-dir", 0o555)

        const result = yield* Effect.result(tsconfig.create(join(tempDir, "readonly-dir")))

        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
        }
      })
    )
  })

  describe("update", () => {
    it.effect("update an existing tsconfig.json config", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            "tsconfig.json",
            JSON.stringify(
              {
                compilerOptions: {
                  strict: true,
                  target: "ES2020",
                },
                include: ["src/**/*"],
              },
              null,
              2
            )
          )
        )

        const existsBefore = yield* tsconfig.detect(tempDir)

        expect(existsBefore).toBe(true)
        yield* tsconfig.update(tempDir)

        const content = yield* Effect.promise(() => testFile("tsconfig.json").text())
        const config = JSON.parse(content)

        expect(config.compilerOptions).toEqual({
          strict: true,
          target: "ES2020",
        })
        expect(config.include).toEqual(["src/**/*"])
        expect(config.extends).toBe("adamantite/typescript")
      })
    )

    it.effect("append the preset to an existing extends string instead of overwriting it", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            "tsconfig.json",
            JSON.stringify(
              {
                compilerOptions: {
                  target: "ES2020",
                },
                extends: "@company/tsconfig",
              },
              null,
              2
            )
          )
        )
        yield* tsconfig.update(tempDir)

        const content = yield* Effect.promise(() => testFile("tsconfig.json").text())
        const config = JSON.parse(content)

        expect(config.extends).toEqual(["@company/tsconfig", "adamantite/typescript"])
        expect(config.compilerOptions).toEqual({ target: "ES2020" })
      })
    )

    it.effect("keep extends as a string when it is already the preset", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile("tsconfig.json", JSON.stringify({ extends: "adamantite/typescript" }, null, 2))
        )
        yield* tsconfig.update(tempDir)

        const content = yield* Effect.promise(() => testFile("tsconfig.json").text())
        const config = JSON.parse(content)

        expect(config.extends).toBe("adamantite/typescript")
      })
    )

    it.effect("append the preset to an existing extends array", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            "tsconfig.json",
            JSON.stringify({ extends: ["@company/tsconfig", "@company/tsconfig-strict"] }, null, 2)
          )
        )
        yield* tsconfig.update(tempDir)

        const content = yield* Effect.promise(() => testFile("tsconfig.json").text())
        const config = JSON.parse(content)

        expect(config.extends).toEqual([
          "@company/tsconfig",
          "@company/tsconfig-strict",
          "adamantite/typescript",
        ])
      })
    )

    it.effect("leave an extends array unchanged when it already contains the preset", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            "tsconfig.json",
            JSON.stringify({ extends: ["adamantite/typescript", "@company/tsconfig"] }, null, 2)
          )
        )
        yield* tsconfig.update(tempDir)

        const content = yield* Effect.promise(() => testFile("tsconfig.json").text())
        const config = JSON.parse(content)

        expect(config.extends).toEqual(["adamantite/typescript", "@company/tsconfig"])
      })
    )

    it.effect("merge an empty config with Adamantite's config", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeFile("tsconfig.json", "{}"))
        yield* tsconfig.update(tempDir)

        const content = yield* Effect.promise(() => testFile("tsconfig.json").text())
        const config = JSON.parse(content)

        expect(config.extends).toBe("adamantite/typescript")
      })
    )

    it.effect("return InvalidConfigFormat when tsconfig.json is not a JSON object", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeFile("tsconfig.json", "true"))

        const result = yield* Effect.result(tsconfig.update(tempDir))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "InvalidConfigFormat" })
        }
      })
    )

    it.effect("return FailedToReadFile when the config does not exist", () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(tsconfig.update(tempDir))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
        }
      })
    )

    it.effect("return FailedToWriteFile when writing the config fails", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            "tsconfig.json",
            JSON.stringify({
              compilerOptions: {
                target: "ES2020",
              },
            })
          )
        )
        chmodSync("tsconfig.json", 0o444)

        const result = yield* Effect.result(tsconfig.update(tempDir))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
        }
      })
    )
  })
})
