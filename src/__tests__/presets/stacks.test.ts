import { join } from "node:path"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as SemVer from "effect/SemVer"
import { LINT_PRESETS, type LintPreset } from "#lib/integrations/tooling/oxlint/presets.ts"
import {
  type FixtureReport,
  lintFixtureTree,
  listFixtureRules,
  listRuleFixtures,
  readFixtureOxlintVersion,
  RULE_FIXTURE_KINDS,
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
  /**
   * The first Oxlint version that makes the report. An older Oxlint, such as the minimum version
   * that `peerDependencies` allows in CI, does not make it.
   */
  readonly since?: string
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
        since: "1.93.0",
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

const OXLINT_VERSION = SemVer.parseUnsafe(readFixtureOxlintVersion())

/**
 * Each known report that the Oxlint of the run makes, as the file and the rule.
 */
function listExpectedReports(knownReports: readonly KnownReport[]): string[] {
  return knownReports.flatMap((known) =>
    known.since === undefined
    || SemVer.isGreaterThanOrEqualTo(OXLINT_VERSION, SemVer.parseUnsafe(known.since))
      ? [`${known.file} ${known.rule}`]
      : []
  )
}

function sortUnique(values: readonly string[]): string[] {
  return EffectArray.sort(EffectArray.dedupe(values), Order.String)
}

describe("stacks", () => {
  it("have each preset of the catalog in a stack", () => {
    expect(sortUnique(Object.values(STACKS).flat())).toStrictEqual(sortUnique(LINT_PRESETS))
  })
})

/**
 * Each rule of the tree that has no fixture of a kind, as the rule and the kind. A rule needs both,
 * so the tree shows what the rule reports and what it accepts.
 */
function listMissingKinds(fixturesDir: string, fixtures: readonly RuleFixture[]): string[] {
  return listFixtureRules(fixturesDir).flatMap((rule) =>
    RULE_FIXTURE_KINDS.flatMap((kind) =>
      fixtures.some((fixture) => fixture.rule === rule && fixture.kind === kind)
        ? []
        : [`${rule} ${kind}`]
    )
  )
}

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

  it("have a valid and an invalid fixture for each rule", () => {
    expect(listMissingKinds(fixturesDir, fixtures)).toStrictEqual([])
  })

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
        sortUnique(listExpectedReports(knownReports))
      )
    })
  })
})
