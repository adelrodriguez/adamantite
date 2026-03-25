import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import { isLeft, runEither } from "#__tests__/helpers.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"

const ROOT_DIR = join(import.meta.dir, "..", "..", "..", "..", "..")

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
    test("detect when oxfmt.config.ts does not exist", async () => {
      const result = await oxfmt
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        format: null,
        hasBoth: false,
        hasBothLegacyJsonFiles: false,
        jsonPath: null,
        jsoncPath: null,
        path: null,
        tsPath: null,
        warnings: [],
      })
    })

    test("detect when oxfmt.config.ts exists", async () => {
      await Bun.write("oxfmt.config.ts", "export default {}\n")

      const result = await oxfmt
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result.format).toBe("ts")
      expect(result.path).toContain("oxfmt.config.ts")
      expect(result.tsPath).toContain("oxfmt.config.ts")
    })
  })

  describe("create", () => {
    test("create oxfmt.config.ts with the correct config", async () => {
      await oxfmt.create(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const { path } = await oxfmt
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(path).toBeDefined()

      const content = await Bun.file("oxfmt.config.ts").text()

      expect(content).toContain('import { defineConfig } from "oxfmt"')
      expect(content).toContain('import format from "adamantite/format"')
      expect(content).toContain("export default defineConfig(format)")
    })
  })

  describe("update", () => {
    test("do nothing when oxfmt.config.ts already exists", async () => {
      const originalContent = "export default { semi: false }\n"
      await Bun.write("oxfmt.config.ts", originalContent)

      await oxfmt.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(await Bun.file("oxfmt.config.ts").text()).toBe(originalContent)
    })

    test("return FileNotFound when oxfmt.config.ts does not exist", async () => {
      const result = await runEither(oxfmt.update(tempDir))

      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FileNotFound" })
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
