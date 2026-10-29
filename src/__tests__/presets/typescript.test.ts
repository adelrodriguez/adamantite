import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"

const REPO_ROOT = join(import.meta.dirname, "../../..")

/**
 * Type check one file in a project that extends the TypeScript preset, and return the TypeScript
 * output.
 */
function check(source: string) {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-typescript-preset-"))

  try {
    writeFileSync(
      join(tempDir, "tsconfig.json"),
      JSON.stringify({
        extends: join(REPO_ROOT, "presets/tsconfig.json"),
        include: ["index.ts"],
      })
    )
    writeFileSync(join(tempDir, "index.ts"), source)

    const result = spawnSync(join(REPO_ROOT, "node_modules/.bin/tsc"), ["-p", "."], {
      cwd: tempDir,
      encoding: "utf8",
    })

    if (result.error) {
      throw result.error
    }

    return { output: result.stdout, status: result.status }
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

describe("typescript preset", () => {
  it("accept erasable syntax", () => {
    expect(check('export const Kind = { A: "a" } as const\n')).toStrictEqual({
      output: "",
      status: 0,
    })
  })

  it("report an enum, because the preset allows only erasable syntax", () => {
    expect(check("enum Kind { A }\n\nexport const kind = Kind.A\n")).toStrictEqual({
      output:
        "index.ts(1,6): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.\n",
      status: 1,
    })
  })
})
