import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import tsrs from "#lib/integrations/tooling/oxlint/tsrs.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"

function runAssess(packageJson: PackageJson) {
  return Effect.gen(function* () {
    const files: FileSystemTestContext = createFileSystemTestContext({
      files: { "package.json": yield* stringifyJson({ name: "test-project", ...packageJson }) },
      root: ROOT,
    })

    return yield* readProject(ROOT).pipe(
      Effect.flatMap((project) => tsrs.assess(project)),
      Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT)])
    )
  })
}

// Each project lists oxlint-tsgolint, which tsrs replaced.
const LEGACY_CASES: ReadonlyArray<{ readonly name: string; readonly packageJson: PackageJson }> = [
  {
    name: "a devDependency",
    packageJson: {
      devDependencies: { "oxlint-tsgolint": "7.0.2005", tsrs: tsrs.version },
      scripts: { check: "adamantite check" },
    },
  },
  {
    name: "a dependency",
    packageJson: {
      dependencies: { "oxlint-tsgolint": "7.0.2005" },
      devDependencies: { tsrs: tsrs.version },
      scripts: { check: "adamantite check" },
    },
  },
  {
    name: "a devDependency of a project without the managed scripts",
    packageJson: { devDependencies: { "oxlint-tsgolint": "7.0.2005" } },
  },
]

describe("tsrs", () => {
  describe("assess", () => {
    it.effect("require tsrs for the managed lint scripts", () =>
      Effect.gen(function* () {
        const result = yield* runAssess({ scripts: { check: "adamantite check" } })

        expect(result.applicable && result.packageActions).toStrictEqual([
          expect.objectContaining({ package: "tsrs", type: "install_package" }),
        ])
      })
    )

    it.effect("report nothing when the pinned tsrs is installed", () =>
      Effect.gen(function* () {
        const result = yield* runAssess({
          devDependencies: { tsrs: tsrs.version },
          scripts: { check: "adamantite check" },
        })

        expect(result).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect.each(LEGACY_CASES)("report oxlint-tsgolint as $name", ({ packageJson }) =>
      Effect.gen(function* () {
        const result = yield* runAssess(packageJson)

        expect(result.applicable && result.findings).toStrictEqual([
          expect.objectContaining({ id: "legacy-oxlint-tsgolint", integration: "tsrs" }),
        ])
      })
    )
  })
})
