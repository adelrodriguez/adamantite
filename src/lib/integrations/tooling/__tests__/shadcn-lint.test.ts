import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import shadcnLint from "#lib/integrations/tooling/shadcn-lint.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { toOxlintTsConfigContent } from "#lib/workspace/tooling/oxlint.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

function runAssess(files: FileSystemTestContext) {
  return readPackageJson(ROOT).pipe(
    Effect.flatMap((packageJson) => shadcnLint.assess(ROOT, packageJson)),
    provideFiles(files)
  )
}

function makePackageJson(manifest: PackageJson) {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...manifest }, null, 2)
}

describe("shadcn-lint", () => {
  describe("assess", () => {
    it.effect("report not applicable when the config does not import the shadcn preset", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": toOxlintTsConfigContent(["react"]),
          "package.json": makePackageJson({ scripts: { check: "adamantite check" } }),
        })

        const result = yield* runAssess(files)

        expect(result).toEqual({ applicable: false, warnings: [] })
      })
    )

    it.effect("report not applicable when the config file is missing", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({ scripts: { check: "adamantite check" } }),
        })

        const result = yield* runAssess(files)

        expect(result).toEqual({ applicable: false, warnings: [] })
      })
    )

    it.effect("report not applicable without a managed lint script", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": toOxlintTsConfigContent(["shadcn"]),
          "package.json": makePackageJson({ scripts: { check: "oxlint" } }),
        })

        const result = yield* runAssess(files)

        expect(result).toEqual({ applicable: false, warnings: [] })
      })
    )

    it.effect("report a missing package when the config imports the shadcn preset", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": toOxlintTsConfigContent(["shadcn"]),
          "package.json": makePackageJson({ scripts: { check: "adamantite check" } }),
        })

        const result = yield* runAssess(files)

        expect(result.applicable).toBe(true)
        expect(result.applicable && result.packageActions).toEqual([
          expect.objectContaining({ package: "@shadcn/lint", type: "install_package" }),
        ])
      })
    )

    it.effect("report no package action when the pinned version is installed", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": toOxlintTsConfigContent(["shadcn"]),
          "package.json": makePackageJson({
            devDependencies: { "@shadcn/lint": shadcnLint.version },
            scripts: { fix: "adamantite fix" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result.applicable && result.packageActions).toEqual([])
      })
    )
  })
})
