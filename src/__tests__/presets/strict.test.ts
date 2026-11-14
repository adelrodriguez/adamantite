import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { OxlintConfig } from "oxlint"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import { testFiles as jestTestFiles } from "#presets/lint/jest.ts"
import adamantitePlugin from "#presets/lint/plugins/adamantite/index.ts"
import antislopPlugin from "#presets/lint/plugins/antislop/index.ts"
import reactStrict from "#presets/lint/react-strict.ts"
import strict from "#presets/lint/strict.ts"
import tanstack from "#presets/lint/tanstack.ts"
import { testFiles as vitestTestFiles } from "#presets/lint/vitest.ts"
import packageJson from "../../../package.json" with { type: "json" }
import {
  lintRuleFixtures,
  listFixtureRules,
  type RuleFixtureCase,
  lintFixtureTree,
  selectRuleFixtures,
} from "./rule-fixtures.ts"
import { STACK_OPTIONS } from "./stacks.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const CORE_PRESET = join(REPO_ROOT, "presets/lint/core.ts")
const STRICT_PRESET = join(REPO_ROOT, "presets/lint/strict.ts")
const FIXTURES_DIR = join(import.meta.dirname, "fixtures/strict")
const NAMESPACE = "adamantite"

function getFirstPartyRules(rules: OxlintConfig["rules"]) {
  return Object.keys(rules ?? {})
    .filter((name) => name.startsWith(`${NAMESPACE}/`))
    .map((name) => name.slice(NAMESPACE.length + 1))
}

const presetRules = getFirstPartyRules(strict.rules)

// The preset enables some antislop rules for every file and the assertion rules only in tests. An
// override that turns a rule off, such as the override for declaration files, enables nothing.
const antislopRules = [strict.rules, ...(strict.overrides ?? []).map((override) => override.rules)]
  .flatMap((rules) => Object.entries(rules ?? {}))
  .flatMap(([name, setting]) => (name.startsWith("antislop/") && setting !== "off" ? [name] : []))

// These rules need options from the target project, such as a layer map, so the project turns them
// on.
const PROJECT_RULES = ["import-owners", "layers"]

describe("strict preset", () => {
  it("enable each rule of the antislop plugin exactly once", () => {
    expect(EffectArray.sort(antislopRules, Order.String)).toStrictEqual(
      EffectArray.sort(
        Object.keys(antislopPlugin.rules).map((rule) => `antislop/${rule}`),
        Order.String
      )
    )
  })

  it("apply its test-file rules to each file that the jest or vitest preset treats as a test", () => {
    const testOverride = strict.overrides?.find(
      (override) => override.rules?.["typescript/consistent-type-assertions"] !== undefined
    )

    expect(testOverride?.files).toStrictEqual([...new Set([...jestTestFiles, ...vitestTestFiles])])
  })

  it("have fixtures for exactly the rules the preset enables", () => {
    expect(listFixtureRules(FIXTURES_DIR)).toStrictEqual(
      EffectArray.sort(
        [...presetRules.map((rule) => `${NAMESPACE}/${rule}`), ...antislopRules],
        Order.String
      )
    )
  })
})

describe("first-party plugin", () => {
  it("have each rule enabled by exactly one of the strict, react-strict, and tanstack presets, or by the project", () => {
    const enabled = [
      ...presetRules,
      ...PROJECT_RULES,
      ...getFirstPartyRules(reactStrict.rules),
      ...getFirstPartyRules(tanstack.rules),
    ]

    expect(EffectArray.sort(enabled, Order.String)).toStrictEqual(
      EffectArray.sort(Object.keys(adamantitePlugin.rules), Order.String)
    )
  })

  it("take the plugin types from the Oxlint version that runs the plugin", () => {
    expect(packageJson.dependencies["@oxlint/plugins"]).toBe(packageJson.devDependencies.oxlint)
  })
})

describe("strict rule fixtures", () => {
  let cases: RuleFixtureCase[]

  beforeAll(() => {
    cases = lintRuleFixtures({
      fixturesDir: FIXTURES_DIR,
      presetPath: STRICT_PRESET,
    })
  })

  describe.each(listFixtureRules(FIXTURES_DIR))("%s", (rule) => {
    it("report every invalid fixture", () => {
      const invalid = selectRuleFixtures(cases, rule, "invalid")
      const missed = invalid.filter((entry) => entry.reportedLines.length === 0)

      expect(invalid).not.toStrictEqual([])
      expect(missed.map((entry) => entry.file)).toStrictEqual([])
    })

    it("report no valid fixture", () => {
      const valid = selectRuleFixtures(cases, rule, "valid")
      const reported = valid.filter((entry) => entry.reportedLines.length > 0)

      expect(valid).not.toStrictEqual([])
      expect(
        reported.map((entry) => `${entry.file}:${entry.reportedLines.join(",")}`)
      ).toStrictEqual([])
    })
  })
})

// The help of three core rules recommends `object`, `unknown`, or `typeof`, which strict reports.
// The help belongs to the upstream rules, so each strict report must name a form that core and
// strict both accept. Then the advice ends after two reports. See #773.
describe("core advice with the strict preset", () => {
  const files = {
    // `typescript/no-explicit-any` recommends `unknown`.
    "any/1-any.ts": [
      "export function describe(value: any): string {",
      "  return JSON.stringify(value)",
      "}",
      "",
    ],
    "any/2-core-advice.ts": [
      "export function describe(value: unknown): string {",
      "  return JSON.stringify(value)",
      "}",
      "",
    ],
    "any/3-strict-advice.ts": [
      "export interface Settings {",
      "  readonly theme: string",
      "}",
      "",
      "export function describe(value: Settings): string {",
      "  return JSON.stringify(value)",
      "}",
      "",
    ],
    // `unicorn/no-instanceof-builtins` recommends `typeof`.
    "instanceof/1-instanceof.ts": [
      "export function label(value: unknown): string {",
      '  return value instanceof String ? value.toString() : ""',
      "}",
      "",
    ],
    "instanceof/2-core-advice.ts": [
      "export function label(value: unknown): string {",
      '  return typeof value === "string" ? value : ""',
      "}",
      "",
    ],
    "instanceof/3-strict-advice.ts": [
      "export function label(value: string | Date): string {",
      '  return typeof value === "string" ? value : value.toISOString()',
      "}",
      "",
    ],
    // `typescript/no-wrapper-object-types` recommends `object`, and its autofix writes it.
    "object/1-wrapper.ts": [
      "export function size(value: Object): number {",
      "  return Object.keys(value).length",
      "}",
      "",
    ],
    "object/2-core-advice.ts": [
      "export function size(value: object): number {",
      "  return Object.keys(value).length",
      "}",
      "",
    ],
    "object/3-strict-advice.ts": [
      "export interface Settings {",
      "  readonly theme: string",
      "}",
      "",
      "export function size(value: Settings): number {",
      "  return Object.keys(value).length",
      "}",
      "",
    ],
  }

  let reports: Record<string, string[]>

  beforeAll(() => {
    const fixturesDir = mkdtempSync(join(tmpdir(), "adamantite-strict-advice-"))

    try {
      for (const [file, lines] of Object.entries(files)) {
        mkdirSync(join(fixturesDir, dirname(file)), { recursive: true })
        writeFileSync(join(fixturesDir, file), lines.join("\n"))
      }

      const results = lintFixtureTree({
        fixturesDir,
        options: STACK_OPTIONS,
        presets: [CORE_PRESET, STRICT_PRESET],
      })

      reports = Object.fromEntries(
        Object.keys(files).map((file) => [
          file,
          EffectArray.sort(
            results.flatMap((report) => (report.file === file ? [report.rule] : [])),
            Order.String
          ),
        ])
      )
    } finally {
      rmSync(fixturesDir, { force: true, recursive: true })
    }
  })

  it("end each chain of advice on a form that core and strict accept", () => {
    expect(reports).toStrictEqual({
      "any/1-any.ts": ["typescript/no-explicit-any"],
      "any/2-core-advice.ts": ["antislop/no-unknown-parameters"],
      "any/3-strict-advice.ts": [],
      "instanceof/1-instanceof.ts": ["unicorn/no-instanceof-builtins"],
      "instanceof/2-core-advice.ts": [
        "antislop/no-runtime-typeof",
        "antislop/no-unknown-parameters",
      ],
      "instanceof/3-strict-advice.ts": [],
      "object/1-wrapper.ts": ["typescript/no-wrapper-object-types"],
      "object/2-core-advice.ts": ["antislop/no-object-parameters"],
      "object/3-strict-advice.ts": [],
    })
  })
})
