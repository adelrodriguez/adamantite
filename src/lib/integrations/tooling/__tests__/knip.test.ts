import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import knip from "#lib/integrations/tooling/knip.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("knip", () => {
  describe("detect", () => {
    it.effect("return null when no knip config is present", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const result = yield* knip.detect(ROOT).pipe(provideFiles(files))

        expect(result).toEqual({
          active: null,
          legacy: [],
          warnings: [],
        })
      })
    )

    it.effect("detect knip.config.ts when present", () =>
      Effect.gen(function* () {
        const files = makeFiles({ "knip.config.ts": "export default {}\n" })

        const result = yield* knip.detect(ROOT).pipe(provideFiles(files))

        expect(result.active).toEqual({
          file: "knip.config.ts",
          format: "ts",
          path: join(ROOT, "knip.config.ts"),
        })
        expect(result.legacy).toEqual([])
      })
    )
  })

  describe("create", () => {
    it.effect("create knip.config.ts with the preset config", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* knip.create(ROOT).pipe(provideFiles(files))

        const state = yield* knip.detect(ROOT).pipe(provideFiles(files))
        expect(state.active).toEqual({
          file: "knip.config.ts",
          format: "ts",
          path: join(ROOT, "knip.config.ts"),
        })

        const content = files.read("knip.config.ts")
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
        const files = makeFiles({
          "package.json": JSON.stringify(
            {
              devDependencies: {
                knip: knip.version,
              },
              name: "test-project",
              version: "1.0.0",
            },
            null,
            2
          ),
        })

        const result = yield* knip.assess(ROOT).pipe(provideFiles(files))

        expect(result).toEqual({
          applicable: false,
          warnings: [],
        })
      })
    )

    it.effect("report missing managed config when the managed analyze script exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify(
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
          ),
        })

        const result = yield* knip.assess(ROOT).pipe(provideFiles(files))

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
        const files = makeFiles({
          "knip.json": JSON.stringify({ entry: ["src/index.ts"] }, null, 2),
          "package.json": JSON.stringify(
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
          ),
        })

        const result = yield* knip.assess(ROOT).pipe(provideFiles(files))

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
        const files = makeFiles({
          "knip.config.ts":
            'import type { KnipConfig } from "knip"\n\nconst config: KnipConfig = {}\n\nexport default config\n',
          "package.json": JSON.stringify(
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
          ),
        })

        const result = yield* knip.assess(ROOT).pipe(provideFiles(files))

        expect(result).toEqual({
          actions: [],
          applicable: true,
          warnings: [],
        })
      })
    )
  })
})
