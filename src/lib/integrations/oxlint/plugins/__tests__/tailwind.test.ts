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
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { readProject } from "#lib/project/project.ts"

const shadcnLint = managedPlugin("@shadcn/lint")

const ROOT = "/project"

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
  return readProject(ROOT).pipe(
    Effect.flatMap((project) => shadcnLint.assess(project)),
    provideFiles(files)
  )
}

function makePackageJson(manifest: PackageJson) {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...manifest }, null, 2)
}

describe("shadcn-lint", () => {
  describe("assess", () => {
    it.effect("report not applicable when the config file is missing", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({ scripts: { check: "adamantite check" } }),
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({ applicable: false })
      })
    )

    it.effect("report not applicable without a managed lint script", () =>
      Effect.gen(function* () {
        const files = makeFiles(
          {
            "oxlint.config.ts": toOxlintTsConfigContent(["tailwind"]),
            "package.json": makePackageJson({ scripts: { check: "oxlint" } }),
          },
          []
        )

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({ applicable: false })
      })
    )

    it.effect("report a missing package when the config imports the tailwind preset", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": toOxlintTsConfigContent(["tailwind"]),
          "package.json": makePackageJson({ scripts: { check: "adamantite check" } }),
        })

        const result = yield* runAssess(files)

        expect(result.applicable).toBe(true)
        expect(result.applicable && result.packageActions).toStrictEqual([
          expect.objectContaining({ package: "@shadcn/lint", type: "install_package" }),
        ])
      })
    )

    it.effect("report no package action when the pinned version is installed", () =>
      Effect.gen(function* () {
        const files = makeFiles(
          {
            "oxlint.config.ts": toOxlintTsConfigContent(["tailwind"]),
            "package.json": makePackageJson({
              devDependencies: { "@shadcn/lint": shadcnLint.version },
              scripts: { fix: "adamantite fix" },
            }),
          },
          ["fix"]
        )

        const result = yield* runAssess(files)

        expect(result.applicable && result.packageActions).toStrictEqual([])
      })
    )
  })
})
