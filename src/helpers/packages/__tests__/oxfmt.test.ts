import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import { parse } from "jsonc-parser"
import { isLeft, runEither } from "#__tests__/helpers.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"

const ROOT_DIR = join(import.meta.dir, "..", "..", "..", "..")

describe("oxfmt", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-oxfmt-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("exists", () => {
    test("detect when .oxfmtrc.jsonc does not exist", async () => {
      const { path } = await oxfmt
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(path).toBe(null)
    })

    test("detect when .oxfmtrc.json exists", async () => {
      await Bun.write(".oxfmtrc.json", JSON.stringify({}))

      const { path } = await oxfmt
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(path).toBeDefined()
      expect(path).toContain(".oxfmtrc.json")
    })
  })

  describe("create", () => {
    test("create .oxfmtrc.jsonc with the correct config", async () => {
      await oxfmt.create(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const { path } = await oxfmt
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(path).toBeDefined()

      const content = await Bun.file(".oxfmtrc.jsonc").text()
      const config = parse(content)

      expect(config).toHaveProperty("$schema")
      expect(config.$schema).toBe("./node_modules/oxfmt/configuration_schema.json")
    })
  })

  describe("update", () => {
    test("update an existing .oxfmtrc.jsonc config", async () => {
      await Bun.write(
        ".oxfmtrc.jsonc",
        JSON.stringify(
          {
            $schema: "https://oxc.rs/schema.json",
            indentStyle: "tab",
          },
          null,
          2
        )
      )

      const existsBefore = await oxfmt
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(existsBefore.path).toBeDefined()

      await oxfmt.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(".oxfmtrc.jsonc").text()
      const config = parse(content)

      expect(config.indentStyle).toBe("tab")
      expect(config.$schema).toBe("./node_modules/oxfmt/configuration_schema.json")
    })

    test("return a FailedToReadFile error when reading the config fails", async () => {
      mkdirSync(".oxfmtrc.jsonc", { recursive: true })

      const result = await runEither(oxfmt.update(tempDir))
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })

    test("merge an empty config with Adamantite's config", async () => {
      await Bun.write(".oxfmtrc.jsonc", "{}")

      await oxfmt.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(".oxfmtrc.jsonc").text()
      const config = parse(content)

      expect(config.$schema).toBe("./node_modules/oxfmt/configuration_schema.json")
    })

    test("return InvalidConfigFormat when the config is not a JSON object", async () => {
      await Bun.write(".oxfmtrc.jsonc", "[]")

      const result = await runEither(oxfmt.update(tempDir))
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "InvalidConfigFormat" })
      }
    })

    test("return a FailedToWriteFile error when writing the config fails", async () => {
      await Bun.write(
        ".oxfmtrc.jsonc",
        JSON.stringify({
          indentStyle: "space",
        })
      )
      chmodSync(".oxfmtrc.jsonc", 0o444)

      const result = await runEither(oxfmt.update(tempDir))
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToWriteFile" })
      }
    })
  })

  describe("version", () => {
    test("match the package.json devDependency", async () => {
      const packageJson = (await Bun.file(join(ROOT_DIR, "package.json")).json()) as PackageJson

      expect(packageJson.devDependencies?.oxfmt).toBe(oxfmt.version)
    })
  })
})
