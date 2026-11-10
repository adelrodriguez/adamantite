import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { managedPlugin } from "#__tests__/managed-plugins.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"

const effectTsgo = managedPlugin("@effect/tsgo")

const ROOT = "/project"

const CONFIGURED_TSCONFIG = JSON.stringify({
  compilerOptions: { plugins: [{ diagnostics: true, name: "@effect/language-service" }] },
})

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT)])
}

function runAssess(files: FileSystemTestContext) {
  return readProject(ROOT).pipe(
    Effect.flatMap((project) => effectTsgo.assess(project)),
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
    it.effect("report not applicable when the config does not import the effect preset", () =>
      Effect.gen(function* () {
        // No package or tsconfig entry: each would be a finding with the preset.
        const files = makeFiles({
          "oxlint.config.ts": toOxlintTsConfigContent([]),
          "package.json": makePackageJson({ scripts: { check: "adamantite check" } }),
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({ applicable: false })
      })
    )

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
