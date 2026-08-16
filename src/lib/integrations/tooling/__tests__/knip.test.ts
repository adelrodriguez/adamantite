import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import knip from "#lib/integrations/tooling/knip.ts"

layer(NodeServices.layer)("knip", (it) => {
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
    it.effect("return null when no knip config is present", () =>
      Effect.gen(function* () {
        const result = yield* knip.detect(tempDir)

        expect(result).toEqual({
          active: null,
          legacy: [],
          warnings: [],
        })
      })
    )

    it.effect("detect knip.config.ts when present", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeFile("knip.config.ts", "export default {}\n"))

        const result = yield* knip.detect(tempDir)

        expect(result.active).toEqual({
          file: "knip.config.ts",
          format: "ts",
          path: join(tempDir, "knip.config.ts"),
        })
        expect(result.legacy).toEqual([])
      })
    )
  })

  describe("create", () => {
    it.effect("create knip.config.ts with the preset config", () =>
      Effect.gen(function* () {
        yield* knip.create(tempDir)

        const state = yield* knip.detect(tempDir)
        expect(state.active).toEqual({
          file: "knip.config.ts",
          format: "ts",
          path: join(tempDir, "knip.config.ts"),
        })

        const content = yield* Effect.promise(() => testFile("knip.config.ts").text())
        expect(content).toContain('import type { KnipConfig } from "knip"')
        expect(content).toContain('import analyze from "adamantite/analyze"')
        expect(content).toContain("const config: KnipConfig = analyze")
        expect(content).toContain("export default config")
      })
    )
  })

  describe("assess", () => {
    it.effect("report not applicable when the managed analyze script is absent", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* knip.assess(tempDir)

        expect(result).toEqual({
          applicable: false,
          warnings: [],
        })
      })
    )

    it.effect("report missing managed config when the managed analyze script exists", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* knip.assess(tempDir)

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
    )

    it.effect("report a migration when a legacy config is active", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )
        yield* Effect.promise(() =>
          writeFile("knip.json", JSON.stringify({ entry: ["src/index.ts"] }, null, 2))
        )

        const result = yield* knip.assess(tempDir)

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
    )

    it.effect("report healthy when package and managed config are present", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )
        yield* Effect.promise(() =>
          writeFile(
            "knip.config.ts",
            'import type { KnipConfig } from "knip"\n\nconst config: KnipConfig = {}\n\nexport default config\n'
          )
        )

        const result = yield* knip.assess(tempDir)

        expect(result).toEqual({
          actions: [],
          applicable: true,
          warnings: [],
        })
      })
    )
  })
})
