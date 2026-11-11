import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"

const REPO_ROOT = join(import.meta.dirname, "../../..")

const PRESETS = {
  tsconfig: join(REPO_ROOT, "presets/tsconfig.json"),
  typescript: join(REPO_ROOT, "presets/typescript.json"),
} as const

const RESETS = join(REPO_ROOT, "presets/typescript/resets")

const FIXTURES = join(REPO_ROOT, "src/__tests__/presets/fixtures/typescript")

/**
 * Type check the fixture project with the given config, and return the TypeScript output.
 */
function checkFixtures(config: "tsconfig.json" | "tsconfig.without-resets.json") {
  const result = spawnSync(join(REPO_ROOT, "node_modules/.bin/tsc"), ["-p", config], {
    cwd: FIXTURES,
    encoding: "utf8",
  })

  if (result.error) {
    throw result.error
  }

  return { output: result.stdout, status: result.status }
}

/**
 * The settings that a test adds to the `tsconfig.json` of the project.
 */
interface ProjectConfig {
  readonly compilerOptions?: { readonly lib: readonly string[] }
  readonly files?: readonly string[]
  readonly include?: readonly string[]
}

const INCLUDE_INDEX: ProjectConfig = { include: ["index.ts"] }

/**
 * Type check one file in a project that extends a TypeScript preset, and return the TypeScript
 * output.
 */
function check(preset: keyof typeof PRESETS, source: string, config = INCLUDE_INDEX) {
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
  output:
    "index.ts(1,14): error TS2322: Type 'unknown' is not assignable to type '{ a: number; }'.\n",
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

  it("apply the reset to a project without include", () => {
    expect(check("typescript", PARSED_JSON, {})).toStrictEqual(PARSED_JSON_ERROR)
  })
})

describe("the type resets", () => {
  const resets = readdirSync(RESETS)
    .filter((file) => file.endsWith(".d.ts") && file !== "index.d.ts" && file !== "helpers.d.ts")
    .map((file) => file.slice(0, -".d.ts".length))

  const fixtures = readdirSync(FIXTURES).filter(
    (file) => file.endsWith(".ts") && file !== "utils.ts"
  )

  it("load every reset from index.d.ts", () => {
    const references = [
      ...readFileSync(join(RESETS, "index.d.ts"), "utf8").matchAll(
        /^\/\/\/ <reference path="(?<file>[^"]+)\.d\.ts" \/>$/gmu
      ),
    ].map((match) => match.groups?.file)

    expect(new Set(references)).toStrictEqual(new Set(resets))
  })

  it("have a fixture for every reset", () => {
    expect(resets.filter((reset) => !fixtures.includes(`${reset}.ts`))).toStrictEqual([])
  })

  it("pass every fixture with the typescript preset", () => {
    expect(checkFixtures("tsconfig.json")).toStrictEqual(PASSED)
  })

  it("fail every fixture without the resets, so each fixture tests a reset", () => {
    const { output } = checkFixtures("tsconfig.without-resets.json")

    const failing = new Set(
      [...output.matchAll(/^(?<file>[\w-]+\.ts)\(/gmu)].map((match) => match.groups?.file)
    )

    expect(failing).toStrictEqual(new Set(fixtures))
  })
})
