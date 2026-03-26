import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import { isLeft, runEither } from "#__tests__/helpers.ts"
import knip from "#lib/integrations/tooling/knip.ts"

const ROOT_DIR = join(import.meta.dir, "..", "..", "..", "..", "..")

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
      const result = await knip
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        active: null,
        legacy: [],
      })
    })

    test("detect knip.config.ts when present", async () => {
      await Bun.write("knip.config.ts", "export default {}\n")

      const result = await knip
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result.active).toEqual({
        format: "ts",
        path: join(tempDir, "knip.config.ts"),
      })
      expect(result.legacy).toEqual([])
    })
  })

  describe("create", () => {
    test("create knip.config.ts with the preset config", async () => {
      await knip.create(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const state = await knip
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(state.active).toEqual({
        format: "ts",
        path: join(tempDir, "knip.config.ts"),
      })

      const content = await Bun.file("knip.config.ts").text()
      expect(content).toContain('import type { KnipConfig } from "knip"')
      expect(content).toContain('import analyze from "adamantite/analyze"')
      expect(content).toContain("const config: KnipConfig = analyze")
      expect(content).toContain("export default config")
    })
  })

  describe("update", () => {
    test("do nothing when knip.config.ts already exists", async () => {
      const originalContent = "export default { entry: ['src/index.ts'] }\n"
      await Bun.write("knip.config.ts", originalContent)

      await knip.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(await Bun.file("knip.config.ts").text()).toBe(originalContent)
    })

    test("return FileNotFound when no knip config exists", async () => {
      const result = await runEither(knip.update(tempDir), NodeServices.layer)

      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FileNotFound" })
      }
    })
  })

  describe("version", () => {
    test("match the package.json devDependency", async () => {
      const packageJson = (await Bun.file(join(ROOT_DIR, "package.json")).json()) as PackageJson

      expect(packageJson.devDependencies?.knip).toBe(knip.version)
    })
  })

  describe("assess", () => {
    test("report not applicable when the managed analyze script is absent", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              knip: knip.version,
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )

      const result = await knip
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [],
        status: "not_applicable",
        warnings: [],
      })
    })

    test("report missing managed config when the managed analyze script exists", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              knip: knip.version,
            },
            name: "test-project",
            scripts: {
              analyze: "adamantite analyze",
            },
            version: "1.0.0",
          },
          null,
          2
        )
      )

      const result = await knip
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [
          {
            description: "Create `knip.config.ts` for `knip`.",
            path: "knip.config.ts",
            type: "create_config",
          },
        ],
        status: "needs_action",
        warnings: [],
      })
    })

    test("report a migration when a legacy config is active", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              knip: knip.version,
            },
            name: "test-project",
            scripts: {
              analyze: "adamantite analyze",
            },
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await Bun.write("knip.json", JSON.stringify({ entry: ["src/index.ts"] }, null, 2))

      const result = await knip
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [
          {
            description: "Migrate legacy `knip.json` to `knip.config.ts`.",
            migrationId: "legacy-knip-json",
            type: "run_migration",
          },
        ],
        status: "needs_action",
        warnings: [],
      })
    })

    test("report healthy when package and managed config are present", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              knip: knip.version,
            },
            name: "test-project",
            scripts: {
              analyze: "adamantite analyze",
            },
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await Bun.write(
        "knip.config.ts",
        'import type { KnipConfig } from "knip"\n\nconst config: KnipConfig = {}\n\nexport default config\n'
      )

      const result = await knip
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [],
        status: "healthy",
        warnings: [],
      })
    })
  })
})
