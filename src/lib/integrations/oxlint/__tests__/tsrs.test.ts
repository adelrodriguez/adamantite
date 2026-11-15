import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { withConfigLoader } from "#__tests__/config-loader.ts"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import tsrs from "#lib/integrations/oxlint/tsrs.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { readProject } from "#lib/project/project.ts"
import { stringifyJson } from "#lib/shared/json.ts"

const ROOT = "/project"

// The lockfile selects the `check` script, which runs Oxlint.
function runAssess(packageJson: PackageJson) {
  return Effect.gen(function* () {
    const files: FileSystemTestContext = createFileSystemTestContext({
      files: {
        [LOCKFILE_PATH]: yield* stringifyJson({
          schemaVersion: 1,
          selection: {
            agents: false,
            ci: null,
            editors: [],
            presets: ["core"],
            scripts: ["check"],
            typescript: null,
          },
          version: "0.0.0",
          written: {},
        }),
        "package.json": yield* stringifyJson({ name: "test-project", ...packageJson }),
      },
      root: ROOT,
    })

    return yield* readProject(ROOT).pipe(
      Effect.flatMap((project) => tsrs.assess(project)),
      Effect.provide(
        withConfigLoader(Layer.mergeAll(files.layer, Path.layer, makeModuleResolverLayer(ROOT)))
      )
    )
  })
}

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
  })
})
