import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Bun from "bun"
import antislop from "#presets/lint/antislop.ts"
import antislopPlugin from "#presets/lint/antislop/plugin.mjs"

const REPO_ROOT = join(import.meta.dir, "../..")

describe("antislop preset", () => {
  test("enable exactly the rules the vendored plugin defines", () => {
    const pluginRules = Object.keys(antislopPlugin.rules).map((name) => `anti-slop/${name}`)
    const presetRules = Object.keys(antislop.rules ?? {}).filter((name) =>
      name.startsWith("anti-slop/")
    )

    expect(new Set(presetRules)).toEqual(new Set(pluginRules))
  })

  test("report anti-slop diagnostics through extends", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "adamantite-antislop-test-"))

    try {
      symlinkSync(join(REPO_ROOT, "node_modules"), join(tempDir, "node_modules"))
      writeFileSync(
        join(tempDir, "oxlint.config.ts"),
        [
          'import { defineConfig } from "oxlint"',
          `import antislop from "${join(REPO_ROOT, "presets/lint/antislop.ts")}"`,
          "",
          "export default defineConfig({ extends: [antislop] })",
          "",
        ].join("\n")
      )
      writeFileSync(
        join(tempDir, "bad.ts"),
        "export const value = JSON.parse('{}') as unknown as string\n"
      )

      const result = Bun.spawnSync(
        [join(REPO_ROOT, "node_modules/.bin/oxlint"), "-c", "oxlint.config.ts", "bad.ts"],
        { cwd: tempDir }
      )

      expect(result.exitCode).not.toBe(0)
      expect(result.stdout.toString()).toContain("anti-slop(no-chained-type-assertions)")
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })
})
