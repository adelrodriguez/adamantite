import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import sherif from "#lib/integrations/tooling/sherif/index.ts"
import { formatJson, stringifyJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT)])
}

function runAssess(files: FileSystemTestContext) {
  return readProject(ROOT).pipe(
    Effect.flatMap((project) => sherif.assess(project)),
    provideFiles(files)
  )
}

describe("sherif", () => {
  describe("assess", () => {
    it.effect("report not applicable when managed monorepo scripts are absent", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* formatJson({
            devDependencies: {
              sherif: sherif.version,
            },
            name: "test-project",
            version: "1.0.0",
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({
          applicable: false,
        })
      })
    )

    it.effect("report missing package for a managed analyze script in a monorepo", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({
            name: "test-project",
            scripts: { analyze: "adamantite analyze" },
            workspaces: ["packages/*"],
          }),
        })

        const result = yield* runAssess(files)

        expect(result.applicable).toBe(true)
        expect(result.applicable && result.packageActions).toStrictEqual([
          expect.objectContaining({ package: "sherif", type: "install_package" }),
        ])
      })
    )

    it.effect("accept a pnpm catalog entry at the required version", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({
            devDependencies: { sherif: "catalog:" },
            name: "test-project",
            scripts: { analyze: "adamantite analyze" },
          }),
          "pnpm-workspace.yaml": `packages:\n  - packages/*\ncatalog:\n  sherif: ${sherif.version}\n`,
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("report not applicable for a managed analyze script outside a monorepo", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({
            name: "test-project",
            scripts: { analyze: "adamantite analyze" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({ applicable: false })
      })
    )
  })
})
