import { join } from "node:path"
import { beforeAll, describe, expect, test } from "@effect/vitest"
import vitest from "#presets/lint/vitest.ts"
import { type FixtureDiagnostic, lintFixtures } from "./rule-fixtures.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const FIXTURES_DIR = join(import.meta.dirname, "fixtures/vitest-contradictions")

/**
 * Pairs of Vitest rules where no code can pass both rules. The preset keeps one rule of each pair.
 * Each pair has fixtures in `fixtures/vitest-contradictions/<kept>/`: `accepted.ts` uses the form
 * that the kept rule requires, and `rejected.ts` uses the form that the other rule requires.
 */
const CONTRADICTING_RULES = [
  { kept: "prefer-importing-vitest-globals", off: "no-importing-vitest-globals" },
  { kept: "prefer-called-once", off: "prefer-called-times" },
  { kept: "valid-title", off: "prefer-describe-function-title" },
]

describe("vitest preset", () => {
  test.each(CONTRADICTING_RULES)("keep $kept and turn off $off", ({ kept, off }) => {
    expect(vitest.rules?.[`vitest/${kept}`]).toBe("error")
    expect(vitest.rules?.[`vitest/${off}`]).toBe("off")
  })
})

describe("vitest contradicting rules", () => {
  let diagnostics: FixtureDiagnostic[] = []

  beforeAll(() => {
    diagnostics = lintFixtures({
      fixturesDir: FIXTURES_DIR,
      presetPath: join(REPO_ROOT, "presets/lint/vitest.ts"),
    })
  })

  describe.each(CONTRADICTING_RULES)("$kept", ({ kept }) => {
    test("report no Vitest rule in the accepted form", () => {
      const reported = diagnostics
        .filter((diagnostic) => diagnostic.file === `${kept}/accepted.ts`)
        .map((diagnostic) => diagnostic.code)
        .filter((code) => code?.startsWith("vitest("))

      expect(reported).toEqual([])
    })

    test("report the rejected form", () => {
      const reported = diagnostics
        .filter((diagnostic) => diagnostic.file === `${kept}/rejected.ts`)
        .map((diagnostic) => diagnostic.code)

      expect(reported).toContain(`vitest(${kept})`)
    })
  })
})
