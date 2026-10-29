import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "@effect/vitest"

const REPO_ROOT = join(import.meta.dirname, "../..")

/**
 * Write a project that uses the repository's Vitest config, with one test that compares a macro's
 * output to the template on disk. The module cache stays in the project, not in the repository.
 */
function writeMacroProject(dir: string) {
  symlinkSync(join(REPO_ROOT, "node_modules"), join(dir, "node_modules"))
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n')
  writeFileSync(
    join(dir, "vitest.config.ts"),
    [
      'import { mergeConfig } from "vitest/config"',
      `import repository from ${JSON.stringify(join(REPO_ROOT, "vitest.config.ts"))}`,
      "",
      `export default mergeConfig(repository, { test: { fsModuleCachePath: ${JSON.stringify(join(dir, ".vitest-cache"))} } })`,
      "",
    ].join("\n")
  )
  mkdirSync(join(dir, "src"))
  writeFileSync(
    join(dir, "src/greeting.macro.ts"),
    [
      'import { readFileSync } from "node:fs"',
      "",
      "export function getGreeting(): string {",
      '  return readFileSync(new URL("greeting.template", import.meta.url), "utf8")',
      "}",
      "",
    ].join("\n")
  )
  writeFileSync(
    join(dir, "src/greeting.test.ts"),
    [
      'import { readFileSync } from "node:fs"',
      'import { expect, it } from "vitest"',
      'import { getGreeting } from "./greeting.macro.ts" with { type: "macro" }',
      "",
      'it("inline the template on disk", () => {',
      '  expect(getGreeting()).toBe(readFileSync(new URL("greeting.template", import.meta.url), "utf8"))',
      "})",
      "",
    ].join("\n")
  )
}

function runVitest(dir: string) {
  const result = spawnSync(
    process.execPath,
    [
      join(REPO_ROOT, "node_modules/vitest/vitest.mjs"),
      "run",
      "--project",
      "unit",
      "--reporter",
      "default",
    ],
    // Vitest prints the results only when `CI` is set.
    { cwd: dir, encoding: "utf8", env: { ...process.env, CI: "1" } }
  )

  if (result.error) {
    throw result.error
  }

  return result.stdout + result.stderr
}

describe("macro module cache", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-macro-cache-"))

  afterAll(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  it("inline the new template text after an edit to only the template", () => {
    writeMacroProject(tempDir)
    writeFileSync(join(tempDir, "src/greeting.template"), "Hello\n")
    expect(runVitest(tempDir)).toMatch(/Tests {2}1 passed/)

    writeFileSync(join(tempDir, "src/greeting.template"), "Goodbye\n")

    expect(runVitest(tempDir)).toMatch(/Tests {2}1 passed/)
  }, 30_000)
})
