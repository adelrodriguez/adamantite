import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import Bun from "bun"

describe("package metadata", () => {
  test("export built preset artifacts", async () => {
    const packageJson = (await Bun.file(
      join(import.meta.dir, "..", "..", "package.json")
    ).json()) as PackageJson

    expect(packageJson.main).toBe("dist/presets/lint/core.js")
    expect(packageJson.exports).toMatchObject({
      "./analyze": {
        default: "./dist/presets/analyze.js",
        types: "./dist/presets/analyze.d.ts",
      },
      "./format": {
        default: "./dist/presets/format.js",
        types: "./dist/presets/format.d.ts",
      },
      "./lint": {
        default: "./dist/presets/lint/core.js",
        types: "./dist/presets/lint/core.d.ts",
      },
      "./lint/*": {
        default: "./dist/presets/lint/*.js",
        types: "./dist/presets/lint/*.d.ts",
      },
      "./typescript": "./dist/presets/tsconfig.json",
    })
  })
})
