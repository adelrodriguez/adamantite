import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, test } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import { runResult } from "#__tests__/helpers.ts"
import tsconfig from "#lib/workspace/tsconfig.ts"

describe("tsconfig", () => {
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
    test("detect when tsconfig.json does not exist", async () => {
      const exists = await tsconfig
        .detect(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(exists).toBe(false)
    })
  })

  describe("create", () => {
    test("create tsconfig.json with the correct config", async () => {
      await tsconfig.create(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const exists = await tsconfig
        .detect(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(exists).toBe(true)

      const content = await testFile("tsconfig.json").text()
      const config = JSON.parse(content)

      expect(config).toHaveProperty("extends")
      expect(config.extends).toBe("adamantite/typescript")
    })

    test("handle write failures when creating tsconfig.json", async () => {
      mkdirSync("readonly-dir", { recursive: true })
      chmodSync("readonly-dir", 0o555)

      const result = await runResult(tsconfig.create(join(tempDir, "readonly-dir")))

      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
      }
    })
  })

  describe("update", () => {
    test("update an existing tsconfig.json config", async () => {
      await writeFile(
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

      const existsBefore = await tsconfig
        .detect(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(existsBefore).toBe(true)

      await tsconfig.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await testFile("tsconfig.json").text()
      const config = JSON.parse(content)

      expect(config.compilerOptions).toEqual({
        strict: true,
        target: "ES2020",
      })
      expect(config.include).toEqual(["src/**/*"])
      expect(config.extends).toBe("adamantite/typescript")
    })

    test("append the preset to an existing extends string instead of overwriting it", async () => {
      await writeFile(
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

      await tsconfig.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await testFile("tsconfig.json").text()
      const config = JSON.parse(content)

      expect(config.extends).toEqual(["@company/tsconfig", "adamantite/typescript"])
      expect(config.compilerOptions).toEqual({ target: "ES2020" })
    })

    test("keep extends as a string when it is already the preset", async () => {
      await writeFile(
        "tsconfig.json",
        JSON.stringify({ extends: "adamantite/typescript" }, null, 2)
      )

      await tsconfig.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await testFile("tsconfig.json").text()
      const config = JSON.parse(content)

      expect(config.extends).toBe("adamantite/typescript")
    })

    test("append the preset to an existing extends array", async () => {
      await writeFile(
        "tsconfig.json",
        JSON.stringify({ extends: ["@company/tsconfig", "@company/tsconfig-strict"] }, null, 2)
      )

      await tsconfig.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await testFile("tsconfig.json").text()
      const config = JSON.parse(content)

      expect(config.extends).toEqual([
        "@company/tsconfig",
        "@company/tsconfig-strict",
        "adamantite/typescript",
      ])
    })

    test("leave an extends array unchanged when it already contains the preset", async () => {
      await writeFile(
        "tsconfig.json",
        JSON.stringify({ extends: ["adamantite/typescript", "@company/tsconfig"] }, null, 2)
      )

      await tsconfig.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await testFile("tsconfig.json").text()
      const config = JSON.parse(content)

      expect(config.extends).toEqual(["adamantite/typescript", "@company/tsconfig"])
    })

    test("merge an empty config with Adamantite's config", async () => {
      await writeFile("tsconfig.json", "{}")

      await tsconfig.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await testFile("tsconfig.json").text()
      const config = JSON.parse(content)

      expect(config.extends).toBe("adamantite/typescript")
    })

    test("return InvalidConfigFormat when tsconfig.json is not a JSON object", async () => {
      await writeFile("tsconfig.json", "true")

      const result = await runResult(tsconfig.update(tempDir))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "InvalidConfigFormat" })
      }
    })

    test("return FailedToReadFile when the config does not exist", async () => {
      const result = await runResult(tsconfig.update(tempDir))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })

    test("return FailedToWriteFile when writing the config fails", async () => {
      await writeFile(
        "tsconfig.json",
        JSON.stringify({
          compilerOptions: {
            target: "ES2020",
          },
        })
      )
      chmodSync("tsconfig.json", 0o444)

      const result = await runResult(tsconfig.update(tempDir))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
      }
    })
  })
})
