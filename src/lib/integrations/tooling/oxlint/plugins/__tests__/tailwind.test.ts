import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { managedPlugin } from "#__tests__/managed-plugins.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import { readProject } from "#lib/workspace/project.ts"

const shadcnLint = managedPlugin("@shadcn/lint")

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT)])
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
        const files = makeFiles({
          "oxlint.config.ts": toOxlintTsConfigContent(["tailwind"]),
          "package.json": makePackageJson({ scripts: { check: "oxlint" } }),
        })

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
        const files = makeFiles({
          "oxlint.config.ts": toOxlintTsConfigContent(["tailwind"]),
          "package.json": makePackageJson({
            devDependencies: { "@shadcn/lint": shadcnLint.version },
            scripts: { fix: "adamantite fix" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result.applicable && result.packageActions).toStrictEqual([])
      })
    )
  })
})
