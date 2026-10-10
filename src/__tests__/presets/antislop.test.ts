import { join } from "node:path"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import antislop from "#presets/lint/antislop.ts"
import antislopPlugin from "#presets/lint/vendor/antislop/plugin.mjs"
import {
  lintRuleFixtures,
  listFixtureRules,
  type RuleFixtureCase,
  selectRuleFixtures,
} from "./rule-fixtures.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const FIXTURES_DIR = join(import.meta.dirname, "fixtures/antislop")
const NAMESPACE = "anti-slop"

const presetRules = Object.keys(antislop.rules ?? {})
  .filter((name) => name.startsWith(`${NAMESPACE}/`))
  .map((name) => name.slice(NAMESPACE.length + 1))

describe("antislop preset", () => {
  it("enable exactly the rules the vendored plugin defines", () => {
    expect(new Set(presetRules)).toStrictEqual(new Set(Object.keys(antislopPlugin.rules)))
  })

  it("have fixtures for exactly the rules the preset enables", () => {
    expect(listFixtureRules(FIXTURES_DIR)).toStrictEqual(
      EffectArray.sort(presetRules, Order.String)
    )
  })
})

describe("antislop rule fixtures", () => {
  let cases: RuleFixtureCase[]

  beforeAll(() => {
    cases = lintRuleFixtures({
      fixturesDir: FIXTURES_DIR,
      namespace: NAMESPACE,
      presetPath: join(REPO_ROOT, "presets/lint/antislop.ts"),
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
