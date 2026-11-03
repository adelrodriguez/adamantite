import { describe, expect, it } from "@effect/vitest"
import { isReportOf } from "#lib/hardening/oxlint.ts"

const BUILT_INS = {
  plugins: new Set(["eslint", "typescript", "unicorn"]),
  rules: new Set([
    "eslint/no-console",
    "eslint/no-restricted-imports",
    "unicorn/no-nested-ternary",
  ]),
}

describe("isReportOf", () => {
  it.each([
    [
      "count a report with the plugin and the name of the rule",
      "eslint(no-console)",
      "no-console",
      true,
    ],
    ["count a report of a custom rule", "project(no-console)", "project/no-console", true],
    [
      "skip a built-in rule with the name of a custom rule",
      "eslint(no-console)",
      "project/no-console",
      false,
    ],
    [
      "skip a rule with the same name in another built-in plugin",
      "eslint(no-nested-ternary)",
      "unicorn/no-nested-ternary",
      false,
    ],
    [
      "count the built-in rule that an alias resolves to",
      "eslint(no-restricted-imports)",
      "typescript/no-restricted-imports",
      true,
    ],
    ["skip another rule of the plugin", "eslint(no-alert)", "no-console", false],
  ])("%s", (_, code, rule, expected) => {
    expect(isReportOf(code, rule, BUILT_INS)).toBe(expected)
  })
})
