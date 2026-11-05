import { describe, expect, it } from "@effect/vitest"
import { isReportOf } from "#lib/hardening/oxlint.ts"

describe("isReportOf", () => {
  it.each([
    ["count a report of a built-in rule", "eslint(no-console)", "eslint", "no-console", true],
    ["count a report of a custom rule", "project(no-console)", "project", "no-console", true],
    [
      "skip a rule with the same name in another plugin",
      "eslint(no-console)",
      "project",
      "no-console",
      false,
    ],
    ["skip another rule of the plugin", "eslint(no-alert)", "eslint", "no-console", false],
  ])("%s", (_, code, plugin, name, expected) => {
    expect(isReportOf(code, { builtIn: plugin === "eslint", name, plugin })).toBe(expected)
  })
})
