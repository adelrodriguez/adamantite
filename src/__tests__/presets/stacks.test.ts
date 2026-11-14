import { join } from "node:path"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import { LINT_PRESETS, type LintPreset } from "#lib/integrations/tooling/oxlint/presets.ts"
import {
  type FixtureReport,
  lintFixtureTree,
  listRuleFixtures,
  type RuleFixture,
} from "./rule-fixtures.ts"
import { listStackPresets, listStacks, STACK_OPTIONS, STACKS } from "./stacks.ts"

interface KnownReport {
  /**
   * Fixture path relative to the fixtures directory of the preset.
   */
  readonly file: string
  /**
   * Why the report stays: the issue of the conflict, or the scope that the fixture proves.
   */
  readonly reason: string
  /**
   * The rule that reports the fixture, which is not the rule of the fixture.
   */
  readonly rule: string
}

interface FixtureTree {
  /**
   * The unstable Effect modules that the fixtures use, which a target project must allow. See
   * "Effect" in the README.
   */
  readonly allowedUnstableApis?: readonly string[]
  /**
   * Each report of another rule on a valid fixture. The test fails when a report is not in the
   * list, and when a report in the list does not occur, so the correction of a conflict removes its
   * entry.
   */
  readonly knownReports: readonly KnownReport[]
  /**
   * The preset that has the rules of the tree. Its fixtures are in `fixtures/<preset>`.
   */
  readonly preset: LintPreset
}

// Strict bans each type assertion outside tests. These fixtures prove that the rules that strict
// turns on only for tests add no report to code outside tests.
const OUTSIDE_TESTS = "Strict reports each type assertion outside tests."

const TREES: readonly FixtureTree[] = [
  {
    knownReports: [
      {
        file: "antislop/no-chained-type-assertions/valid/outside-tests.ts",
        reason: OUTSIDE_TESTS,
        rule: "typescript/consistent-type-assertions",
      },
      {
        file: "antislop/no-widen-then-assert/valid/outside-tests.ts",
        reason: OUTSIDE_TESTS,
        rule: "typescript/consistent-type-assertions",
      },
      {
        file: "antislop/no-widen-then-assert/valid/outside-tests.ts",
        reason: "The assertion needs a widened value, which this rule reports in each file.",
        rule: "antislop/no-known-value-widening",
      },
      {
        file: "antislop/require-safety-comment-for-type-assertion/valid/outside-tests.ts",
        reason: OUTSIDE_TESTS,
        rule: "typescript/consistent-type-assertions",
      },
      {
        file: "antislop/no-unknown-parameters/valid/then-rejection-callback.ts",
        reason:
          "Since Oxlint 1.93, core's promise/prefer-catch reports the rejection callback of then(), as eslint-plugin-promise does. The fixture proves that the strict rule accepts it where a project allows then(). catch-callback.ts proves the catch() form.",
        rule: "promise/prefer-catch",
      },
    ],
    preset: "strict",
  },
  {
    allowedUnstableApis: ["effect/FileSystem", "effect/PlatformError"],
    knownReports: [],
    preset: "effect",
  },
  {
    knownReports: [],
    preset: "react-strict",
  },
  {
    knownReports: [],
    preset: "tanstack",
  },
  {
    // `layer` of @effect/vitest is an unstable API.
    allowedUnstableApis: ["@effect/vitest"],
    knownReports: [],
    preset: "vitest",
  },
]

function sortUnique(values: readonly string[]): string[] {
  return EffectArray.sort(EffectArray.dedupe(values), Order.String)
}

describe("stacks", () => {
  it("have each preset of the catalog in a stack", () => {
    expect(sortUnique(Object.values(STACKS).flat())).toStrictEqual(sortUnique(LINT_PRESETS))
  })
})

/**
 * The invalid fixtures that do not have a report of their own rule.
 */
function listMissedFixtures(
  fixtures: readonly RuleFixture[],
  reports: readonly FixtureReport[]
): string[] {
  return fixtures.flatMap((fixture) =>
    fixture.kind === "invalid"
    && !reports.some((report) => report.file === fixture.file && report.rule === fixture.rule)
      ? [fixture.file]
      : []
  )
}

/**
 * Each report on a valid fixture, as the file and the rule.
 */
function listValidReports(
  fixtures: readonly RuleFixture[],
  reports: readonly FixtureReport[]
): string[] {
  const valid = new Set(
    fixtures.flatMap((fixture) => (fixture.kind === "valid" ? [fixture.file] : []))
  )

  return sortUnique(
    reports.flatMap((report) => (valid.has(report.file) ? [`${report.file} ${report.rule}`] : []))
  )
}

describe.each(TREES)("$preset rule fixtures", ({ allowedUnstableApis, knownReports, preset }) => {
  const fixturesDir = join(import.meta.dirname, "fixtures", preset)
  const fixtures = listRuleFixtures(fixturesDir)

  describe.each(listStacks(preset))("with the %s stack", (stack) => {
    let reports: FixtureReport[]

    beforeAll(() => {
      reports = lintFixtureTree({
        allowedUnstableApis,
        fixturesDir,
        options: STACK_OPTIONS,
        presets: listStackPresets(stack),
      })
    })

    it("report every invalid fixture with the rule of the fixture", () => {
      expect(listMissedFixtures(fixtures, reports)).toStrictEqual([])
    })

    it("report no valid fixture with a rule of the stack, except the known reports", () => {
      expect(listValidReports(fixtures, reports)).toStrictEqual(
        sortUnique(knownReports.map((known) => `${known.file} ${known.rule}`))
      )
    })
  })
})
