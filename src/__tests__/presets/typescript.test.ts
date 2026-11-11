import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"

const REPO_ROOT = join(import.meta.dirname, "../../..")

const PRESETS = {
  tsconfig: join(REPO_ROOT, "presets/tsconfig.json"),
  typescript: join(REPO_ROOT, "presets/typescript.json"),
} as const

/**
 * Type check one file in a project that extends a TypeScript preset, and return the TypeScript
 * output. `config` adds top-level settings to the project's `tsconfig.json`.
 */
function check(
  preset: keyof typeof PRESETS,
  source: string,
  config: Record<string, unknown> = { include: ["index.ts"] }
) {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-typescript-preset-"))

  try {
    writeFileSync(
      join(tempDir, "tsconfig.json"),
      JSON.stringify({ extends: PRESETS[preset], ...config })
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

const PASSED = { output: "", status: 0 }

const PARSED_JSON = 'export const value: { a: number } = JSON.parse("{}")\n'

const PARSED_JSON_ERROR = {
  output: "index.ts(1,14): error TS2322: Type 'unknown' is not assignable to type '{ a: number; }'.\n",
  status: 1,
}

describe.each(["tsconfig", "typescript"] as const)("the %s preset", (preset) => {
  it("accept erasable syntax", () => {
    expect(check(preset, 'export const Kind = { A: "a" } as const\n')).toStrictEqual(PASSED)
  })

  it("report an enum, because the preset allows only erasable syntax", () => {
    expect(check(preset, "enum Kind { A }\n\nexport const kind = Kind.A\n")).toStrictEqual({
      output:
        "index.ts(1,6): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.\n",
      status: 1,
    })
  })
})

describe("the tsconfig preset", () => {
  it("keep the built-in types, so JSON.parse() returns any", () => {
    expect(check("tsconfig", PARSED_JSON)).toStrictEqual(PASSED)
  })
})

describe("the typescript preset", () => {
  it("return unknown from JSON.parse()", () => {
    expect(check("typescript", PARSED_JSON)).toStrictEqual(PARSED_JSON_ERROR)
  })

  it("return unknown from a property read on localStorage", () => {
    expect(
      check("typescript", "export const theme: string = localStorage.theme\n", {
        compilerOptions: { lib: ["esnext", "dom"] },
        include: ["index.ts"],
      })
    ).toStrictEqual({
      output: "index.ts(1,14): error TS2322: Type 'unknown' is not assignable to type 'string'.\n",
      status: 1,
    })
  })

  it("accept a wider value in includes() on a literal array", () => {
    expect(
      check(
        "typescript",
        'const kinds = ["a", "b"] as const\n\nexport const has = (value: string) => kinds.includes(value)\n'
      )
    ).toStrictEqual(PASSED)
  })

  it("apply the reset to a project without include", () => {
    expect(check("typescript", PARSED_JSON, {})).toStrictEqual(PARSED_JSON_ERROR)
  })

  it('turn the reset off with "files": []', () => {
    expect(check("typescript", PARSED_JSON, { files: [], include: ["index.ts"] })).toStrictEqual(
      PASSED
    )
  })
})
