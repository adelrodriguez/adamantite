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
        active: null,
        legacy: [],
      })
    })

    test("detect when oxfmt.config.ts exists", async () => {
      await Bun.write("oxfmt.config.ts", "export default {}\n")

      const result = await oxfmt
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result.active).toEqual({
        format: "ts",
        path: join(tempDir, "oxfmt.config.ts"),
      })
      expect(result.legacy).toEqual([])
    })
  })

  describe("create", () => {
    test("create oxfmt.config.ts with the correct config", async () => {
      await oxfmt.create(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const state = await oxfmt
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(state.active).toEqual({
        format: "ts",
        path: join(tempDir, "oxfmt.config.ts"),
      })

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

  describe("assess", () => {
    test("report not applicable when the managed format script is absent", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              oxfmt: oxfmt.version,
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )

      const result = await oxfmt
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [],
        status: "not_applicable",
        warnings: [],
      })
    })

    test("report missing managed config when the managed format script exists", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              oxfmt: oxfmt.version,
            },
            name: "test-project",
            scripts: {
              format: "adamantite format",
            },
            version: "1.0.0",
          },
          null,
          2
        )
      )

      const result = await oxfmt
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result.status).toBe("needs_action")
      expect(result.actions).toEqual([
        {
          description: "Create `oxfmt.config.ts` for `oxfmt`.",
          path: "oxfmt.config.ts",
          type: "create_config",
        },
      ])
    })

    test("report healthy when managed format script and config exist", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              oxfmt: oxfmt.version,
            },
            name: "test-project",
            scripts: {
              format: "adamantite format",
            },
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await Bun.write(
        "oxfmt.config.ts",
        'import { defineConfig } from "oxfmt"\n\nexport default defineConfig({})\n'
      )

      const result = await oxfmt
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [],
        status: "healthy",
        warnings: [],
      })
    })

    test("report missing package when managed format script exists", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            name: "test-project",
            scripts: {
              format: "adamantite format",
            },
            version: "1.0.0",
          },
          null,
          2
        )
      )

      const result = await oxfmt
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result.actions).toEqual([
        {
          description: "Install `oxfmt@0.41.0` for the managed `format` script.",
          package: "oxfmt",
          targetVersion: oxfmt.version,
          type: "install_package",
        },
        {
          description: "Create `oxfmt.config.ts` for `oxfmt`.",
          path: "oxfmt.config.ts",
          type: "create_config",
        },
      ])
      expect(result.status).toBe("needs_action")
    })
  })
})
