import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"

layer(NodeServices.layer)("oxfmt", (it) => {
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

  describe("detect", () => {
    it.effect("detect when oxfmt.config.ts does not exist", () =>
      Effect.gen(function* () {
        const result = yield* oxfmt.detect(tempDir)

        expect(result).toEqual({
          active: null,
          legacy: [],
          warnings: [],
        })
      })
    )

    it.effect("detect when oxfmt.config.ts exists", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeFile("oxfmt.config.ts", "export default {}\n"))

        const result = yield* oxfmt.detect(tempDir)

        expect(result.active).toEqual({
          file: "oxfmt.config.ts",
          format: "ts",
          path: join(tempDir, "oxfmt.config.ts"),
        })
        expect(result.legacy).toEqual([])
      })
    )
  })

  describe("create", () => {
    it.effect("create oxfmt.config.ts with the correct config", () =>
      Effect.gen(function* () {
        yield* oxfmt.create(tempDir)

        const state = yield* oxfmt.detect(tempDir)
        expect(state.active).toEqual({
          file: "oxfmt.config.ts",
          format: "ts",
          path: join(tempDir, "oxfmt.config.ts"),
        })

        const content = yield* Effect.promise(() => testFile("oxfmt.config.ts").text())

        expect(content).toContain('import { defineConfig } from "oxfmt"')
        expect(content).toContain('import format from "adamantite/format"')
        expect(content).toContain("export default defineConfig(format)")
      })
    )
  })

  describe("assess", () => {
    it.effect("report not applicable when the managed format script is absent", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* oxfmt.assess(tempDir)

        expect(result).toEqual({
          applicable: false,
          warnings: [],
        })
      })
    )

    it.effect("report missing managed config when the managed format script exists", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* oxfmt.assess(tempDir)

        expect(result).toEqual({
          actions: [
            {
              description: "Create `oxfmt.config.ts` for `oxfmt`.",
              path: "oxfmt.config.ts",
              type: "create_config",
            },
          ],
          applicable: true,
          warnings: [],
        })
      })
    )

    it.effect("report healthy when managed format script and config exist", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )
        yield* Effect.promise(() =>
          writeFile(
            "oxfmt.config.ts",
            'import { defineConfig } from "oxfmt"\n\nexport default defineConfig({})\n'
          )
        )

        const result = yield* oxfmt.assess(tempDir)

        expect(result).toEqual({
          actions: [],
          applicable: true,
          warnings: [],
        })
      })
    )

    it.effect("report missing package when managed format script exists", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* oxfmt.assess(tempDir)

        expect(result).toEqual({
          actions: [
            {
              description: `Install \`oxfmt@${oxfmt.version}\` for the managed \`format\` script.`,
              package: "oxfmt",
              targetVersion: oxfmt.version,
              type: "install_package",
            },
            {
              description: "Create `oxfmt.config.ts` for `oxfmt`.",
              path: "oxfmt.config.ts",
              type: "create_config",
            },
          ],
          applicable: true,
          warnings: [],
        })
      })
    )
  })
})
