import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import { describe, expect, test } from "@effect/vitest"

describe("package metadata", () => {
  test("publish expected package metadata", async () => {
    // SAFETY: this reads the repo's own package.json, which the package manager already requires to conform to the PackageJson schema.
    const packageJson = JSON.parse(
      await readFile(join(import.meta.dirname, "..", "..", "package.json"), "utf8")
    ) as PackageJson

    expect(packageJson.main).toBe("dist/presets/lint/core.js")
    expect(packageJson.devDependencies?.typescript).toBe("7.0.2")
    expect(packageJson.peerDependencies?.typescript).toBe(">=7")
    expect(packageJson.packageManager).toBe("pnpm@12.0.0-rc.6")
    expect(packageJson.engines?.bun).toBe(">=1.0.0")
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
