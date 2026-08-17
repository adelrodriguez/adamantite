import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
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
    Effect.flatMap((packageJson) => sherif.assess(ROOT, packageJson)),
    provideFiles(files)
  )
}

describe("sherif", () => {
  describe("assess", () => {
    it.effect("report not applicable when managed monorepo scripts are absent", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify(
            {
              devDependencies: {
                sherif: sherif.version,
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

    it.effect("report missing package when the managed monorepo check script exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify(
            {
              name: "test-project",
              scripts: {
                "check:monorepo": "adamantite monorepo",
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
              description: `Install \`sherif@${sherif.version}\` for the managed monorepo scripts.`,
              package: sherif.name,
              targetVersion: sherif.version,
              type: "install_package",
            },
          ],
          applicable: true,
          warnings: [],
        })
      })
    )

    it.effect("report healthy when the package and managed monorepo script are present", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify(
            {
              devDependencies: {
                sherif: sherif.version,
              },
              name: "test-project",
              scripts: {
                "fix:monorepo": "adamantite monorepo --fix",
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
  })
})
