import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

function runAssess(files: FileSystemTestContext) {
  return readPackageJson(ROOT).pipe(
    Effect.flatMap((packageJson) => oxfmt.assess(ROOT, packageJson)),
    provideFiles(files)
  )
}

describe("oxfmt", () => {
  describe("detect", () => {
    it.effect("detect when oxfmt.config.ts does not exist", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const result = yield* oxfmt.detect(ROOT).pipe(provideFiles(files))

        expect(result).toEqual({
          active: null,
          legacy: [],
          warnings: [],
        })
      })
    )

    it.effect("detect when oxfmt.config.ts exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({ "oxfmt.config.ts": "export default {}\n" })

        const result = yield* oxfmt.detect(ROOT).pipe(provideFiles(files))

        expect(result.active).toEqual({
          file: "oxfmt.config.ts",
          format: "ts",
          path: join(ROOT, "oxfmt.config.ts"),
        })
        expect(result.legacy).toEqual([])
      })
    )
  })

  describe("create", () => {
    it.effect("create oxfmt.config.ts with the correct config", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* oxfmt.create(ROOT).pipe(provideFiles(files))

        const state = yield* oxfmt.detect(ROOT).pipe(provideFiles(files))
        expect(state.active).toEqual({
          file: "oxfmt.config.ts",
          format: "ts",
          path: join(ROOT, "oxfmt.config.ts"),
        })

        const content = files.read("oxfmt.config.ts")

        expect(content).toContain('import { defineConfig } from "oxfmt"')
        expect(content).toContain('import format from "adamantite/format"')
        expect(content).toContain("export default defineConfig(format)")
      })
    )
  })

  describe("assess", () => {
    it.effect("report not applicable when the managed format script is absent", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify(
            {
              devDependencies: {
                oxfmt: oxfmt.version,
              },
              name: "test-project",
              version: "1.0.0",
            },
            null,
            2
          ),
        })

        const result = yield* runAssess(files)

        expect(result).toEqual({
          applicable: false,
          warnings: [],
        })
      })
    )

    it.effect("report missing managed config when the managed format script exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify(
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
          ),
        })

        const result = yield* runAssess(files)

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
        const files = makeFiles({
          "oxfmt.config.ts":
            'import { defineConfig } from "oxfmt"\n\nexport default defineConfig({})\n',
          "package.json": JSON.stringify(
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
          ),
        })

        const result = yield* runAssess(files)

        expect(result).toEqual({
          actions: [],
          applicable: true,
          warnings: [],
        })
      })
    )

    it.effect("report missing package when managed format script exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify(
            {
              name: "test-project",
              scripts: {
                format: "adamantite format",
              },
              version: "1.0.0",
            },
            null,
            2
          ),
        })

        const result = yield* runAssess(files)

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
