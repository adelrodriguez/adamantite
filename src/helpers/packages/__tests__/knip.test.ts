import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as PlatformError from "effect/PlatformError"
import { parse } from "jsonc-parser"
import { isLeft, runEither } from "#__tests__/helpers.ts"
import { knip } from "#helpers/packages/knip.ts"

const ROOT_DIR = join(import.meta.dir, "..", "..", "..", "..")
// Keep these schema URLs in sync with the major-version-pinned values in src/helpers/packages/knip.ts.
const KNIP_JSON_SCHEMA_URL = "https://unpkg.com/knip@5/schema.json"
const KNIP_JSONC_SCHEMA_URL = "https://unpkg.com/knip@5/schema-jsonc.json"

describe("knip", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-knip-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("exists", () => {
    test("return null when no knip config is present", async () => {
      const { path } = await knip
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(path).toBe(null)
    })

    test("detect knip.json when present", async () => {
      await Bun.write("knip.json", JSON.stringify({}))

      const { path } = await knip
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(path).toEndWith("knip.json")
    })

    test("detect knip.jsonc when present", async () => {
      await Bun.write("knip.jsonc", "{}")

      const { path } = await knip
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(path).toContain("knip.jsonc")
    })

    test("prefer knip.json when both config formats exist", async () => {
      await Bun.write("knip.json", JSON.stringify({ entry: ["src/index.ts"] }, null, 2))
      await Bun.write("knip.jsonc", "{}")

      const { path } = await knip
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(path).toEndWith("knip.json")
    })
  })

  describe("create", () => {
    test("create knip.json with the preset config", async () => {
      await knip.create(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const { path } = await knip
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(path).toContain("knip.json")

      const config = await Bun.file("knip.json").json()
      expect(config).toEqual(knip.config)
    })
  })

  describe("update", () => {
    test("merge an existing knip.json config without dropping user entries", async () => {
      await Bun.write(
        "knip.json",
        JSON.stringify(
          {
            entry: ["src/main.ts"],
          },
          null,
          2
        )
      )

      await knip.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const config = await Bun.file("knip.json").json()
      expect(config.entry).toEqual(["src/main.ts"])
      expect(config.$schema).toBe(KNIP_JSON_SCHEMA_URL)
      expect(config.rules).toEqual(knip.config.rules)
    })

    test("write the jsonc schema when updating knip.jsonc", async () => {
      await Bun.write("knip.jsonc", "{}")

      await knip.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file("knip.jsonc").text()
      const config = parse(content)

      expect(config.$schema).toBe(KNIP_JSONC_SCHEMA_URL)
      expect(config.rules).toEqual(knip.config.rules)
    })

    test("merge an empty knip config with the preset", async () => {
      await Bun.write("knip.json", "{}")

      await knip.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const config = await Bun.file("knip.json").json()
      expect(config.$schema).toBe(KNIP_JSON_SCHEMA_URL)
      expect(config.ignoreFiles).toEqual(knip.config.ignoreFiles)
      expect(config.ignore).toEqual(knip.config.ignore)
    })

    test("return FileNotFound when no knip config exists", async () => {
      const result = await runEither(knip.update(tempDir), NodeServices.layer)

      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FileNotFound" })
      }
    })

    test("return FailedToReadFile when the config cannot be read", async () => {
      const fileSystemLayer = FileSystem.layerNoop({
        exists: (path) => Effect.succeed(path.endsWith("knip.json")),
        readFileString: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "Unknown",
              cause: new Error("Simulated read failure"),
              method: "readFileString",
              module: "FileSystem",
            })
          ),
      })

      const result = await runEither(
        knip.update(tempDir),
        fileSystemLayer.pipe(Layer.provideMerge(NodeServices.layer))
      )

      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })

    test("return InvalidConfigFormat when the config is not a JSON object", async () => {
      await Bun.write("knip.json", "[]")

      const result = await runEither(knip.update(tempDir), NodeServices.layer)

      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "InvalidConfigFormat" })
      }
    })
  })

  describe("version", () => {
    test("match the package.json devDependency", async () => {
      const packageJson = (await Bun.file(join(ROOT_DIR, "package.json")).json()) as PackageJson

      expect(packageJson.devDependencies?.knip).toBe(knip.version)
    })
  })
})
