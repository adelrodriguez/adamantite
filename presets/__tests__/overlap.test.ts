import { join } from "node:path"
import type { OxlintConfig } from "oxlint"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import architecture from "#presets/lint/architecture.ts"
import core from "#presets/lint/core.ts"
import effect from "#presets/lint/effect.ts"
import jest from "#presets/lint/jest.ts"
import nextjs from "#presets/lint/nextjs.ts"
import reactStrict from "#presets/lint/react-strict.ts"
import react from "#presets/lint/react.ts"
import strict from "#presets/lint/strict.ts"
import tailwind from "#presets/lint/tailwind.ts"
import tanstack from "#presets/lint/tanstack.ts"
import vitest from "#presets/lint/vitest.ts"
import vue from "#presets/lint/vue.ts"
import {
  type FixtureReport,
  lintFixtureTree,
  listFixtureRules,
  listRuleFixtures,
} from "./rule-fixtures.ts"
import { type LintPreset, STACK_OPTIONS } from "./stacks.ts"

const REPO_ROOT = join(import.meta.dirname, "../..")
const CORE_PRESET = join(REPO_ROOT, "presets/lint/core.ts")
const FIXTURES_DIR = join(import.meta.dirname, "../../src/__tests__/presets/fixtures/overlap")

const PRESETS = {
  architecture,
  effect,
  jest,
  nextjs,
  react,
  "react-strict": reactStrict,
  strict,
  tailwind,
  tanstack,
  vitest,
  vue,
} satisfies Record<LintPreset, OxlintConfig>

const PRESET_NAMES = EffectArray.sort(
  Object.keys(PRESETS).filter((name): name is LintPreset => name in PRESETS),
  Order.String
)

function listRules(config: OxlintConfig): string[] {
  return EffectArray.dedupe(
    [config.rules, ...(config.overrides ?? []).map((override) => override.rules)]
      .flatMap((rules) => Object.keys(rules ?? {}))
      // A config names a rule of ESLint without its plugin, such as `no-console`.
      .map((name) => (name.includes("/") ? name : `eslint/${name}`))
  )
}

const coreRules = new Set(listRules(core))

function listCoreChanges(preset: LintPreset): string[] {
  return EffectArray.sort(
    listRules(PRESETS[preset]).filter((rule) => coreRules.has(rule)),
    Order.String
  )
}

const changingPresets = PRESET_NAMES.filter((preset) => listCoreChanges(preset).length > 0)

describe("preset rules", () => {
  it("have no rule that two presets set, except a rule of core", () => {
    const shared = PRESET_NAMES.flatMap((first) =>
      PRESET_NAMES.filter((second) => second > first).flatMap((second) => {
        const rules = new Set(listRules(PRESETS[second]))

        return listRules(PRESETS[first])
          .filter((rule) => rules.has(rule))
          .map((rule) => `${first} and ${second}: ${rule}`)
      })
    )

    expect(shared).toStrictEqual([])
  })

  it.each(PRESET_NAMES)("have a fixture for each rule of core that %s changes", (preset) => {
    expect(listFixtureRules(join(FIXTURES_DIR, preset))).toStrictEqual(listCoreChanges(preset))
  })
})

describe.each(changingPresets)("%s changes of core rules", (preset) => {
  const fixturesDir = join(FIXTURES_DIR, preset)
  const fixtures = listRuleFixtures(fixturesDir)
  let coreReports: FixtureReport[]
  let presetReports: FixtureReport[]

  function listReported(reports: readonly FixtureReport[], rule: string): string[] {
    return fixtures.flatMap((fixture) =>
      fixture.rule === rule
      && reports.some((report) => report.file === fixture.file && report.rule === rule)
        ? [fixture.file]
        : []
    )
  }

  function listInvalid(rule: string): string[] {
    return fixtures.flatMap((fixture) =>
      fixture.rule === rule && fixture.kind === "invalid" ? [fixture.file] : []
    )
  }

  beforeAll(() => {
    coreReports = lintFixtureTree({ fixturesDir, options: STACK_OPTIONS, presets: [CORE_PRESET] })
    presetReports = lintFixtureTree({
      fixturesDir,
      options: STACK_OPTIONS,
      presets: [CORE_PRESET, join(REPO_ROOT, `presets/lint/${preset}.ts`)],
    })
  })

  describe.each(listCoreChanges(preset))("%s", (rule) => {
    it("report each invalid fixture and no valid fixture with core and the preset", () => {
      expect(listReported(presetReports, rule)).toStrictEqual(listInvalid(rule))
    })

    it("give a fixture a result that differs from the result of core alone", () => {
      expect(listReported(presetReports, rule)).not.toStrictEqual(listReported(coreReports, rule))
    })
  })
})
