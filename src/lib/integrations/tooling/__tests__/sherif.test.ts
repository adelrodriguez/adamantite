import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import sherif from "#lib/integrations/tooling/sherif.ts"

const ROOT_DIR = join(import.meta.dir, "..", "..", "..", "..", "..")

describe("sherif", () => {
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
    test("report not applicable when managed monorepo scripts are absent", async () => {
      await Bun.write(
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

      const result = await sherif
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        applicable: false,
        warnings: [],
      })
    })

    test("report missing package when the managed monorepo check script exists", async () => {
      await Bun.write(
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

      const result = await sherif
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

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

    test("report healthy when the package and managed monorepo script are present", async () => {
      await Bun.write(
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

      const result = await sherif
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [],
        applicable: true,
        warnings: [],
      })
    })
  })

  describe("version", () => {
    test("match the package.json devDependency", async () => {
      const packageJson = (await Bun.file(join(ROOT_DIR, "package.json")).json()) as PackageJson

      expect(packageJson.devDependencies?.sherif).toBe(sherif.version)
    })
  })
})
