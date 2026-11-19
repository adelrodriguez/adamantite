import { readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as SemVer from "effect/SemVer"
import {
  type FixtureReport,
  lintFixtureTree,
  listFixtureRules,
  listRuleFixtures,
  readFixtureOxlintVersion,
  RULE_FIXTURE_KINDS,
  type RuleFixture,
} from "./rule-fixtures.ts"
import { type LintPreset, listStackPresets, listStacks, STACK_OPTIONS, STACKS } from "./stacks.ts"

interface KnownReport {
  readonly file: string
  readonly reason: string
  readonly rule: string
  readonly sinceOxlint?: string
}

interface FixtureTree {
  readonly allowedUnstableApis?: readonly string[]
  readonly knownReports: readonly KnownReport[]
  readonly preset: LintPreset
}

const OUTSIDE_TESTS = "Strict reports each type assertion outside tests."

const TREES: readonly FixtureTree[] = [
  {
    knownReports: [
      {
        file: "quality/no-chained-type-assertions/valid/outside-tests.ts",
        reason: OUTSIDE_TESTS,
        rule: "typescript/consistent-type-assertions",
      },
      {
        file: "quality/no-widen-then-assert/valid/outside-tests.ts",
        reason: OUTSIDE_TESTS,
        rule: "typescript/consistent-type-assertions",
      },
      {
        file: "quality/no-widen-then-assert/valid/outside-tests.ts",
        reason: "The assertion needs a widened value, which this rule reports in each file.",
        rule: "quality/no-known-value-widening",
      },
      {
        file: "quality/require-safety-comment-for-type-assertion/valid/outside-tests.ts",
        reason: OUTSIDE_TESTS,
        rule: "typescript/consistent-type-assertions",
      },
      {
        file: "quality/no-unknown-parameters/valid/then-rejection-callback.ts",
        reason:
          "Since Oxlint 1.93, core's promise/prefer-catch reports the rejection callback of then(), as eslint-plugin-promise does. The fixture proves that the strict rule accepts it where a project allows then(). catch-callback.ts proves the catch() form.",
        rule: "promise/prefer-catch",
        sinceOxlint: "1.93.0",
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

function listExpectedReports(knownReports: readonly KnownReport[]): string[] {
  return knownReports.flatMap((known) =>
    known.sinceOxlint === undefined
    || SemVer.isGreaterThanOrEqualTo(OXLINT_VERSION, SemVer.parseUnsafe(known.sinceOxlint))
      ? [`${known.file} ${known.rule}`]
      : []
  )
}

function sortUnique(values: readonly string[]): string[] {
  return EffectArray.sort(EffectArray.dedupe(values), Order.String)
}

describe("stacks", () => {
  it("have each lint preset in a stack", () => {
    const presets = readdirSync(join(import.meta.dirname, "../lint"))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => basename(file, ".ts"))
      .filter((name) => name !== "core")

    expect(sortUnique(Object.values(STACKS).flat())).toStrictEqual(sortUnique(presets))
  })
})

function listMissingKinds(fixturesDir: string, fixtures: readonly RuleFixture[]): string[] {
  return listFixtureRules(fixturesDir).flatMap((rule) =>
    RULE_FIXTURE_KINDS.flatMap((kind) =>
      fixtures.some((fixture) => fixture.rule === rule && fixture.kind === kind)
        ? []
        : [`${rule} ${kind}`]
    )
  )
}

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
  const fixturesDir = join(import.meta.dirname, "../../src/__tests__/presets/fixtures", preset)
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
