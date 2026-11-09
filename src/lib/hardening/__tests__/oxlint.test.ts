import { describe, expect, it } from "@effect/vitest"
import * as Option from "effect/Option"
import { isReportOf, parseOxlintReport } from "#lib/hardening/oxlint.ts"

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

describe("parseOxlintReport", () => {
  it("give each file name with / between folders, as on Windows Oxlint prints \\", () => {
    const report = parseOxlintReport(
      [
        "No files found to lint.",
        JSON.stringify({
          diagnostics: [
            {
              code: "eslint(no-console)",
              filename: "src\\cart\\index.ts",
              labels: [{ span: { column: 1, line: 1 } }],
              message: "Unexpected console statement.",
            },
          ],
          number_of_files: 1,
        }),
      ].join("\n")
    )

    expect(
      Option.map(report, ({ diagnostics }) => diagnostics.map((diagnostic) => diagnostic.filename))
    ).toStrictEqual(Option.some(["src/cart/index.ts"]))
  })
})
