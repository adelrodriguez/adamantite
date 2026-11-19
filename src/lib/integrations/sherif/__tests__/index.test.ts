import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import {
  createDependencyInstallerTestContext,
  makeLockfileFile,
  runCommand,
} from "#__tests__/command-test-helpers.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeSelection, runLifecycle } from "#__tests__/lifecycle.ts"
import initCommand from "#commands/init.ts"
import updateCommand from "#commands/update.ts"
import { PACKAGE as knip } from "#lib/integrations/knip/index.ts"
import { PACKAGE as sherif } from "#lib/integrations/sherif/index.ts"

const MONOREPO_PACKAGE_JSON =
  '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" }, "workspaces": ["packages/*"] }\n'

const PACKAGE_JSON = '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" } }\n'

const ANALYZE = makeSelection({ scripts: ["analyze"] })

describe("Sherif setup", () => {
  it.effect.each([
    {
      name: "a monorepo",
      packageJson: MONOREPO_PACKAGE_JSON,
      packages: [`knip@${knip.version}`, `sherif@${sherif.version}`],
      workspace: true,
    },
    {
      name: "a single package",
      packageJson: PACKAGE_JSON,
      packages: [`knip@${knip.version}`],
      workspace: false,
    },
  ])(
    "install Sherif for analyze only in a monorepo: $name",
    ({ packageJson, packages, workspace }) =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({ files: { "package.json": packageJson } })
        const installer = createDependencyInstallerTestContext()

        yield* runCommand(initCommand, ["--non-interactive", "--script", "analyze"], {
          files,
          layers: [installer.layer],
        })

        expect(installer.calls).toStrictEqual([{ options: { workspace }, packages }])
      })
  )

  it.effect("install the managed Sherif version again in update", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { ...makeLockfileFile(ANALYZE), "package.json": MONOREPO_PACKAGE_JSON },
      })

      const installer = createDependencyInstallerTestContext()

      yield* runCommand(updateCommand, [], { files, layers: [installer.layer] })

      expect(installer.calls.flatMap((call) => call.packages)).toContain(`sherif@${sherif.version}`)
    })
  )

  it.effect("report a missing Sherif in a monorepo in doctor", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { ...makeLockfileFile(ANALYZE), "package.json": MONOREPO_PACKAGE_JSON },
      })

      const { output } = yield* runLifecycle("doctor", files)

      expect(output).toContain("Missing sherif")
    })
  )
})
