import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { toOxfmtTsConfigContent } from "#lib/integrations/tooling/oxfmt/config.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import { formatJson, stringifyJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(
  files: FileSystemTestContext,
  packages: Readonly<Record<string, string>> = {}
) {
  return Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT, packages)])
}

function runAssess(files: FileSystemTestContext, packages: Readonly<Record<string, string>> = {}) {
  return readProject(ROOT).pipe(
    Effect.flatMap((project) => oxfmt.assess(project)),
    provideFiles(files, packages)
  )
}

const OXFMT_PACKAGE = { "oxfmt/package.json": "node_modules/oxfmt/package.json" }

const COMPILER_PACKAGE = {
  "@astrojs/compiler-rs/package.json": "node_modules/@astrojs/compiler-rs/package.json",
}

/**
 * A project with the managed Oxfmt setup that declares Astro `astro`.
 */
function makeAstroFiles(astro: string) {
  return Effect.gen(function* () {
    return makeFiles({
      "oxfmt.config.ts": toOxfmtTsConfigContent(),
      "package.json": yield* formatJson({
        devDependencies: { astro, oxfmt: oxfmt.version },
        scripts: { check: "adamantite check" },
      }),
    })
  })
}

describe("oxfmt", () => {
  describe("create", () => {
    it.effect("create a config that assess accepts", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({
            devDependencies: { oxfmt: oxfmt.version },
            name: "test-project",
            scripts: { check: "adamantite check" },
            version: "1.0.0",
          }),
        })

        yield* oxfmt.create(ROOT).pipe(provideFiles(files))

        expect(yield* runAssess(files)).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )
  })

  describe("assess", () => {
    it.effect("report healthy when managed check script and config exist", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxfmt.config.ts": toOxfmtTsConfigContent(),
          "package.json": yield* formatJson({
            devDependencies: {
              oxfmt: oxfmt.version,
            },
            name: "test-project",
            scripts: {
              check: "adamantite check",
            },
            version: "1.0.0",
          }),
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

    it.effect("report an Astro project whose Oxfmt cannot load the Astro compiler", () =>
      Effect.gen(function* () {
        // Astro 6 depends on @astrojs/compiler, not on @astrojs/compiler-rs.
        const result = yield* runAssess(yield* makeAstroFiles("6.1.0"), OXFMT_PACKAGE)

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              currentState: expect.stringContaining("`@astrojs/compiler-rs`"),
              id: "unavailable-astro-compiler",
              integration: "oxfmt",
            },
          ],
        })
      })
    )

    it.effect("accept an Astro project whose Oxfmt loads the Astro compiler", () =>
      Effect.gen(function* () {
        const result = yield* runAssess(yield* makeAstroFiles("7.4.12"), {
          ...OXFMT_PACKAGE,
          ...COMPILER_PACKAGE,
        })

        expect(result).toMatchObject({ applicable: true, findings: [] })
      })
    )

    it.effect("leave the Astro compiler to package assessment when Oxfmt is missing", () =>
      Effect.gen(function* () {
        const result = yield* runAssess(yield* makeAstroFiles("6.1.0"))

        expect(result.applicable && result.findings).not.toContainEqual(
          expect.objectContaining({ id: "unavailable-astro-compiler" })
        )
      })
    )

    it.effect("report missing package when managed fix script exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* formatJson({
            name: "test-project",
            scripts: {
              fix: "adamantite fix",
            },
            version: "1.0.0",
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [{ id: "missing-oxfmt" }, { id: "missing-oxfmt-config" }],
          packageActions: [{ package: "oxfmt", type: "install_package" }],
          warnings: [],
        })
      })
    )
  })
})
