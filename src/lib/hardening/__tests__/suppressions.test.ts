import { describe, expect, it } from "@effect/vitest"
import { findSuppressions } from "#lib/hardening/suppressions.ts"

describe("findSuppressions", () => {
  it("read the rules and the line of each disable comment, without the reason", () => {
    expect(
      findSuppressions(
        "a.ts",
        [
          "/* oxlint-disable no-console, eslint/no-alert */",
          "// eslint-disable-next-line typescript/no-explicit-any -- the API returns any",
          "export const value: any = 1 // oxlint-disable-line no-magic-numbers",
          "// eslint-disable",
          "",
        ].join("\n")
      )
    ).toStrictEqual([
      { line: 1, rules: ["no-console", "eslint/no-alert"] },
      { line: 2, rules: ["typescript/no-explicit-any"] },
      { line: 3, rules: ["no-magic-numbers"] },
      { line: 4, rules: [] },
    ])
  })

  it("skip strings, enable comments, and comments that only mention a directive", () => {
    expect(
      findSuppressions(
        "a.ts",
        [
          'export const text = "// oxlint-disable-next-line no-console"',
          "// oxlint-enable no-console",
          "/**",
          " * oxlint-disable-line no-console",
          " */",
          "// Use oxlint-disable-next-line only with a reason.",
          "// oxlint-disabled no-console",
          "",
        ].join("\n")
      )
    ).toStrictEqual([])
  })

  it("find none in a file that does not parse", () => {
    expect(findSuppressions("a.ts", "// oxlint-disable\nexport const = ;\n")).toStrictEqual([])
  })
})
