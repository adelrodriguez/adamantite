import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import Bun from "bun"
import { knip } from "#helpers/packages/knip.ts"

const ROOT_DIR = join(import.meta.dir, "..", "..", "..", "..")

describe("knip", () => {
  describe("version", () => {
    test("match the package.json devDependency", async () => {
      const packageJson = (await Bun.file(join(ROOT_DIR, "package.json")).json()) as PackageJson

      expect(packageJson.devDependencies?.knip).toBe(knip.version)
    })
  })
})
