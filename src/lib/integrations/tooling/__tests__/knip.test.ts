import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, test } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import knip from "#lib/integrations/tooling/knip.ts"

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

  describe("detect", () => {
    test("return null when no knip config is present", async () => {
      const result = await knip
        .detect(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        active: null,
        legacy: [],
        warnings: [],
      })
    })

    test("detect knip.config.ts when present", async () => {
      await writeFile("knip.config.ts", "export default {}\n")

      const result = await knip
        .detect(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result.active).toEqual({
        file: "knip.config.ts",
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
        .detect(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(state.active).toEqual({
        file: "knip.config.ts",
        format: "ts",
        path: join(tempDir, "knip.config.ts"),
      })

      const content = await testFile("knip.config.ts").text()
      expect(content).toContain('import type { KnipConfig } from "knip"')
      expect(content).toContain('import analyze from "adamantite/analyze"')
      expect(content).toContain("const config: KnipConfig = analyze")
      expect(content).toContain("export default config")
    })
  })

  describe("assess", () => {
    test("report not applicable when the managed analyze script is absent", async () => {
      await writeFile(
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
        applicable: false,
        warnings: [],
      })
    })

    test("report missing managed config when the managed analyze script exists", async () => {
      await writeFile(
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
        applicable: true,
        warnings: [],
      })
    })

    test("report a migration when a legacy config is active", async () => {
      await writeFile(
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
      await writeFile("knip.json", JSON.stringify({ entry: ["src/index.ts"] }, null, 2))

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
        applicable: true,
        warnings: [],
      })
    })

    test("report healthy when package and managed config are present", async () => {
      await writeFile(
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
      await writeFile(
        "knip.config.ts",
        'import type { KnipConfig } from "knip"\n\nconst config: KnipConfig = {}\n\nexport default config\n'
      )

      const result = await knip
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [],
        applicable: true,
        warnings: [],
      })
    })
  })
})
