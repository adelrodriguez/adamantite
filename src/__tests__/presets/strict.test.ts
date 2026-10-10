import { join } from "node:path"
import type { OxlintConfig } from "oxlint"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import adamantitePlugin from "#presets/lint/plugin/index.ts"
import reactStrict from "#presets/lint/react-strict.ts"
import strict from "#presets/lint/strict.ts"
import tanstack from "#presets/lint/tanstack.ts"
import {
  lintRuleFixtures,
  listFixtureRules,
  type RuleFixtureCase,
  selectRuleFixtures,
} from "./rule-fixtures.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const FIXTURES_DIR = join(import.meta.dirname, "fixtures/strict")
const NAMESPACE = "adamantite"

function getFirstPartyRules(rules: OxlintConfig["rules"]) {
  return Object.keys(rules ?? {})
    .filter((name) => name.startsWith(`${NAMESPACE}/`))
    .map((name) => name.slice(NAMESPACE.length + 1))
}

const presetRules = getFirstPartyRules(strict.rules)

describe("strict preset", () => {
  it("have fixtures for exactly the rules the preset enables", () => {
    expect(listFixtureRules(FIXTURES_DIR)).toStrictEqual(
      EffectArray.sort(presetRules, Order.String)
    )
  })

  it("ban type assertions outside tests", () => {
    expect(strict.rules?.["typescript/consistent-type-assertions"]).toStrictEqual([
      "error",
      { assertionStyle: "never" },
    ])
  })
})

describe("first-party plugin", () => {
  it("have each rule enabled by exactly one of the strict, react-strict, and tanstack presets", () => {
    const enabled = [
      ...presetRules,
      ...getFirstPartyRules(reactStrict.rules),
      ...getFirstPartyRules(tanstack.rules),
    ]

    expect(EffectArray.sort(enabled, Order.String)).toStrictEqual(
      EffectArray.sort(Object.keys(adamantitePlugin.rules), Order.String)
    )
  })
})

describe("strict rule fixtures", () => {
  let cases: RuleFixtureCase[]

  beforeAll(() => {
    cases = lintRuleFixtures({
      fixturesDir: FIXTURES_DIR,
      namespace: NAMESPACE,
      presetPath: join(REPO_ROOT, "presets/lint/strict.ts"),
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
