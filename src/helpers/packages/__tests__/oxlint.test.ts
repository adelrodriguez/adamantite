import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import { isLeft, runEither } from "#__tests__/helpers.ts"
import { oxlint, tsgolint } from "#helpers/packages/oxlint.ts"

const ROOT_DIR = join(import.meta.dir, "..", "..", "..", "..")

describe("oxlint", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-oxlint-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("exists", () => {
    test("detect when no oxlint config exists", async () => {
      const state = await oxlint
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(state.path).toBe(null)
      expect(state.format).toBe(null)
      expect(state.hasBoth).toBe(false)
    })

    test("report both configs and prefer oxlint.config.ts", async () => {
      await Bun.write(
        "oxlint.config.ts",
        'import { defineConfig } from "oxlint"\n\nexport default defineConfig({})\n'
      )
      await Bun.write(".oxlintrc.json", "{}")

      const state = await oxlint
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(state.hasBoth).toBe(true)
      expect(state.format).toBe("ts")
      expect(state.path).toContain("oxlint.config.ts")
    })
  })

  describe("create", () => {
    test("create oxlint.config.ts with the correct config", async () => {
      await oxlint.create(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const state = await oxlint
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(state.path).toContain("oxlint.config.ts")
      expect(state.format).toBe("ts")

      const content = await Bun.file("oxlint.config.ts").text()
      expect(content).toContain('import { defineConfig } from "oxlint"')
      expect(content).toContain('import core from "adamantite/lint"')
      expect(content).toContain("extends: [core]")
    })
  })

  describe("update", () => {
    test("migrate a legacy .oxlintrc.json file to oxlint.config.ts", async () => {
      await Bun.write(
        ".oxlintrc.json",
        JSON.stringify(
          {
            $schema: "https://oxc.rs/schema.json",
            extends: ["adamantite/lint/react"],
            rules: {
              "no-console": "warn",
            },
          },
          null,
          2
        )
      )

      await oxlint
        .update(tempDir, ["node"])
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const state = await oxlint
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(state.format).toBe("ts")
      expect(state.path).toContain("oxlint.config.ts")
      expect(state.jsonPath).toBe(null)

      const hasLegacyConfig = await Bun.file(".oxlintrc.json").exists()
      expect(hasLegacyConfig).toBe(false)

      const content = await Bun.file("oxlint.config.ts").text()
      expect(content).toContain('"no-console": "warn"')
      expect(content).toContain('import core from "adamantite/lint"')
      expect(content).toContain('import react from "adamantite/lint/react"')
      expect(content).toContain('import node from "adamantite/lint/node"')
    })

    test("migrate Adamantite preset paths with and without a dot prefix", async () => {
      await Bun.write(
        ".oxlintrc.json",
        JSON.stringify(
          {
            extends: [
              "node_modules/adamantite/presets/lint/react.ts",
              "./node_modules/adamantite/presets/lint/node.json",
            ],
          },
          null,
          2
        )
      )

      await oxlint.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file("oxlint.config.ts").text()
      expect(content).toContain('import core from "adamantite/lint"')
      expect(content).toContain('import react from "adamantite/lint/react"')
      expect(content).toContain('import node from "adamantite/lint/node"')
      expect(content).not.toContain("node_modules/adamantite/presets/lint/react.ts")
    })

    test("return FileNotFound when no oxlint config exists", async () => {
      const result = await runEither(oxlint.update(tempDir))
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FileNotFound" })
      }
    })

    test("return FailedToReadFile when reading the legacy config fails", async () => {
      mkdirSync(".oxlintrc.json", { recursive: true })

      const result = await runEither(oxlint.update(tempDir))
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })

    test("return InvalidConfigFormat when the legacy config is not a JSON object", async () => {
      await Bun.write(".oxlintrc.json", "[]")

      const result = await runEither(oxlint.update(tempDir))
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "InvalidConfigFormat" })
      }
    })
  })

  describe("version", () => {
    test("match the package.json devDependency", async () => {
      const packageJson = (await Bun.file(join(ROOT_DIR, "package.json")).json()) as PackageJson

      expect(packageJson.devDependencies?.oxlint).toBe(oxlint.version)
    })
  })
})

describe("tsgolint", () => {
  describe("version", () => {
    test("match the package.json devDependency", async () => {
      const packageJson = (await Bun.file(join(ROOT_DIR, "package.json")).json()) as PackageJson

      expect(packageJson.devDependencies?.["oxlint-tsgolint"]).toBe(tsgolint.version)
    })
  })
})
