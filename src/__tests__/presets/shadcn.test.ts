import { join } from "node:path"
import { beforeAll, describe, expect, test } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import shadcn from "#presets/lint/shadcn.ts"
import shadcnPlugin from "#presets/lint/vendor/shadcn/plugin.mjs"
import { lintRuleFixtures, listFixtureRules, type RuleFixtureCase } from "./rule-fixtures.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const FIXTURES_DIR = join(import.meta.dirname, "fixtures/shadcn")
const PROJECT_DIR = join(import.meta.dirname, "fixtures/shadcn-project")
const NAMESPACE = "shadcn"

const presetRules = Object.keys(shadcn.rules ?? {})
  .filter((name) => name.startsWith(`${NAMESPACE}/`))
  .map((name) => name.slice(NAMESPACE.length + 1))

describe("shadcn preset", () => {
  test("enable exactly the rules the vendored plugin defines", () => {
    expect(new Set(presetRules)).toEqual(new Set(Object.keys(shadcnPlugin.rules)))
  })

  test("have fixtures for exactly the rules the preset enables", () => {
    expect(listFixtureRules(FIXTURES_DIR)).toEqual(EffectArray.sort(presetRules, Order.String))
  })
})

describe("shadcn rule fixtures", () => {
  let cases: RuleFixtureCase[] = []

  beforeAll(() => {
    cases = lintRuleFixtures({
      fixturesDir: FIXTURES_DIR,
      namespace: NAMESPACE,
      presetPath: join(REPO_ROOT, "presets/lint/shadcn.ts"),
      projectDir: PROJECT_DIR,
    })
  })

  describe.each(listFixtureRules(FIXTURES_DIR))("%s", (rule) => {
    test("report every invalid fixture", () => {
      const invalid = cases.filter((entry) => entry.rule === rule && entry.kind === "invalid")
      const missed = invalid.filter((entry) => entry.reportedLines.length === 0)

      expect(invalid).not.toEqual([])
      expect(missed.map((entry) => entry.file)).toEqual([])
    })

    test("report no valid fixture", () => {
      const valid = cases.filter((entry) => entry.rule === rule && entry.kind === "valid")
      const reported = valid.filter((entry) => entry.reportedLines.length > 0)

      expect(valid).not.toEqual([])
      expect(reported.map((entry) => `${entry.file}:${entry.reportedLines.join(",")}`)).toEqual([])
    })
  })
})
