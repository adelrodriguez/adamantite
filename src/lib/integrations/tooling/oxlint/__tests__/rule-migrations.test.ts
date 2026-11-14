import { describe, expect, it } from "@effect/vitest"
import { findRetiredRules } from "#lib/integrations/tooling/oxlint/rule-migrations.ts"

describe("findRetiredRules", () => {
  it("find old rule keys in config and override entries", () => {
    expect(
      findRetiredRules(
        "oxlint.config.ts",
        `export default {
  rules: { "anti-slop/no-runtime-typeof": "off" },
  overrides: [{ files: ["*.ts"], rules: { "anti-slop-effect/no-throw": "error" } }],
}`
      )
    ).toStrictEqual([
      { line: 2, rule: "anti-slop/no-runtime-typeof" },
      { line: 3, rule: "anti-slop-effect/no-throw" },
    ])
  })

  it("ignore new names, unrelated strings, and config comments", () => {
    expect(
      findRetiredRules(
        "oxlint.config.ts",
        `export default {
      // anti-slop/no-runtime-typeof
      rules: { "antislop/no-runtime-typeof": "off" },
      text: "anti-slop/no-runtime-typeof",
    }`
      )
    ).toStrictEqual([])
  })
})
