import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { writeFile } from "#__tests__/filesystem.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"

layer(NodeServices.layer)("sherif", (it) => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-sherif-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("assess", () => {
    it.effect("report not applicable when managed monorepo scripts are absent", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            "package.json",
            JSON.stringify(
              {
                devDependencies: {
                  sherif: sherif.version,
                },
                name: "test-project",
                version: "1.0.0",
              },
              null,
              2
            )
          )
        )

        const result = yield* sherif.assess(tempDir)

        expect(result).toEqual({
          applicable: false,
          warnings: [],
        })
      })
    )

    it.effect("report missing package when the managed monorepo check script exists", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            "package.json",
            JSON.stringify(
              {
                name: "test-project",
                scripts: {
                  "check:monorepo": "adamantite monorepo",
                },
                version: "1.0.0",
              },
              null,
              2
            )
          )
        )

        const result = yield* sherif.assess(tempDir)

        expect(result).toEqual({
          actions: [
            {
              description: `Install \`sherif@${sherif.version}\` for the managed monorepo scripts.`,
              package: sherif.name,
              targetVersion: sherif.version,
              type: "install_package",
            },
          ],
          applicable: true,
          warnings: [],
        })
      })
    )

    it.effect("report healthy when the package and managed monorepo script are present", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            "package.json",
            JSON.stringify(
              {
                devDependencies: {
                  sherif: sherif.version,
                },
                name: "test-project",
                scripts: {
                  "fix:monorepo": "adamantite monorepo --fix",
                },
                version: "1.0.0",
              },
              null,
              2
            )
          )
        )

        const result = yield* sherif.assess(tempDir)

        expect(result).toEqual({
          actions: [],
          applicable: true,
          warnings: [],
        })
      })
    )
  })
})
