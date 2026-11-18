import { describe, expect, it } from "@effect/vitest"
import * as Option from "effect/Option"
import { parseOxlintReport } from "#lib/integrations/oxlint/files.ts"

describe("parseOxlintReport", () => {
  it("give each file name with / between folders, as on Windows Oxlint prints \\", () => {
    const report = parseOxlintReport(
      [
        "No files found to lint.",
        JSON.stringify({
          diagnostics: [
            {
              code: "eslint(no-console)",
              filename: String.raw`src\cart\index.ts`,
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
