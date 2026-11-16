import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import type { Script } from "#lib/project/package-json.ts"
import type { Selection } from "#lib/project/selection.ts"
import { withConfigLoader } from "#__tests__/config-loader.ts"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { managedPlugin } from "#__tests__/managed-plugins.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/oxlint/config.ts"
import * as Project from "#lib/project/index.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { stringifyJson } from "#lib/shared/json.ts"

const effectTsgo = managedPlugin("@effect/tsgo")

const ROOT = "/project"

const CONFIGURED_TSCONFIG = JSON.stringify({
  compilerOptions: { plugins: [{ diagnostics: true, name: "@effect/language-service" }] },
})

// The lockfile selects `scripts`, so the plugin applies only for a script that runs Oxlint.
function makeFiles(files: Record<string, string>, scripts: readonly Script[] = ["check"]) {
  const selection = {
    agents: false,
    ci: null,
    editors: [],
    presets: ["core"],
    scripts,
    typescript: null,
  } satisfies Selection

  const lockfile = JSON.stringify({ schemaVersion: 1, selection, version: "0.0.0", written: {} })

  return createFileSystemTestContext({ files: { [LOCKFILE_PATH]: lockfile, ...files }, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(
    withConfigLoader(Layer.mergeAll(files.layer, Path.layer, makeModuleResolverLayer(ROOT)))
  )
}

function runAssess(files: FileSystemTestContext) {
  return Project.read().pipe(
    Effect.flatMap((project) => effectTsgo.assess(project)),
    Effect.provideService(Project.Directory, ROOT),
    provideFiles(files)
  )
}

function makePackageJson(manifest: PackageJson) {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...manifest }, null, 2)
}

/**
 * A project that meets every goal, so a test changes only the part it checks.
 */
function makeConfiguredFiles(overrides: Record<string, string> = {}) {
  return makeFiles({
    "oxlint.config.ts": toOxlintTsConfigContent(["effect"]),
    "package.json": makePackageJson({
      devDependencies: { "@effect/tsgo": effectTsgo.version },
      scripts: { check: "adamantite check" },
    }),
    "tsconfig.json": CONFIGURED_TSCONFIG,
    ...overrides,
  })
}

describe("effect-tsgo", () => {
  describe("assess", () => {
    it.effect("report nothing when the package and the tsconfig entry are in place", () =>
      Effect.gen(function* () {
        const files = makeConfiguredFiles()

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("report the package and the tsconfig entry when both are missing", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": toOxlintTsConfigContent(["effect"]),
          "package.json": makePackageJson({ scripts: { check: "adamantite check" } }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            { id: "missing-@effect/tsgo" },
            {
              currentState: expect.stringContaining("does not configure"),
              id: "missing-effect-language-service-plugin",
            },
          ],
          packageActions: [{ package: "@effect/tsgo", type: "install_package" }],
        })
      })
    )

    it.effect("report a language service entry that disables semantic quick fixes", () =>
      Effect.gen(function* () {
        const files = makeConfiguredFiles({
          "tsconfig.json": yield* stringifyJson({
            compilerOptions: {
              plugins: [{ diagnostics: false, name: "@effect/language-service" }],
            },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          findings: [
            {
              currentState: expect.stringContaining("disables its diagnostics"),
              id: "missing-effect-language-service-plugin",
            },
          ],
        })
      })
    )

    it.effect("return guidance instead of a tsconfig finding in a monorepo", () =>
      Effect.gen(function* () {
        const files = makeConfiguredFiles({
          "package.json": makePackageJson({
            devDependencies: { "@effect/tsgo": effectTsgo.version },
            scripts: { check: "adamantite check" },
            workspaces: ["packages/*"],
          }),
          "tsconfig.json": "{}",
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [expect.stringContaining("in a monorepo, add")],
        })
      })
    )
  })
})
