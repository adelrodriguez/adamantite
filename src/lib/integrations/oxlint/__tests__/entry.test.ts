import type * as Layer from "effect/Layer"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import type { ModuleResolver } from "#lib/project/module-resolver.ts"
import {
  makeLockfileFile,
  OXLINT_COMMAND,
  toolsInstalledLayer,
} from "#__tests__/command-test-helpers.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeSelection } from "#__tests__/lifecycle.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { getOxlintCommand, getProjectDirectory } from "#lib/integrations/oxlint/entry.ts"
import { ToolNotSelected } from "#lib/shared/errors.ts"

const CWD = "/somewhere/else"

/**
 * The Oxlint command of the project at `/project`, with `files` and the packages that `resolver`
 * finds.
 */
function runIn(files: Readonly<Record<string, string>>, resolver: Layer.Layer<ModuleResolver>) {
  return getOxlintCommand("/project").pipe(
    Effect.provide([createFileSystemTestContext({ files }).layer, Path.layer, resolver])
  )
}

describe("oxlint-entry", () => {
  describe("getProjectDirectory", () => {
    it("take the folder above node_modules for an installed entry", () => {
      expect(getProjectDirectory("/project/node_modules/adamantite/dist/oxlint.js", CWD)).toBe(
        "/project"
      )
    })

    it("take the folder above the first node_modules for an entry in the pnpm store", () => {
      expect(
        getProjectDirectory(
          "/project/node_modules/.pnpm/adamantite@1.0.0/node_modules/adamantite/dist/oxlint.js",
          CWD
        )
      ).toBe("/project")
    })

    it("take the workspace package that installs the entry", () => {
      expect(
        getProjectDirectory("/project/packages/web/node_modules/adamantite/dist/oxlint.js", CWD)
      ).toBe("/project/packages/web")
    })

    it("take the folder above node_modules for a Windows path", () => {
      expect(
        getProjectDirectory(String.raw`C:\project\node_modules\adamantite\dist\oxlint.js`, CWD)
      ).toBe(String.raw`C:\project`)
    })

    it("take the working directory for an entry outside node_modules", () => {
      expect(getProjectDirectory("/adamantite/src/oxlint/index.ts", CWD)).toBe(CWD)
    })
  })

  describe("getOxlintCommand", () => {
    it.effect("start Oxlint's CLI module of the project with Node.js", () =>
      Effect.gen(function* () {
        expect(yield* runIn({}, toolsInstalledLayer)).toStrictEqual(OXLINT_COMMAND)
      })
    )

    it.effect(
      "name the init command when Oxlint is missing and the lockfile selects no script that runs it",
      () =>
        Effect.gen(function* () {
          const error = yield* Effect.flip(
            runIn(
              makeLockfileFile(makeSelection({ scripts: ["analyze"] })),
              makeModuleResolverLayer("/project")
            )
          )

          expect(error).toStrictEqual(new ToolNotSelected({ script: "check", tool: "oxlint" }))
        })
    )
  })
})
