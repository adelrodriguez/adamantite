import { describe, expect, it } from "@effect/vitest"
import { findRuleOffOverrides } from "#lib/hardening/overrides.ts"

function makeConfig(body: string) {
  return `import { defineConfig } from "oxlint"\n\nexport default defineConfig(${body})\n`
}

describe("findRuleOffOverrides", () => {
  it("find each override that turns a rule off, with its position and files", () => {
    expect(
      findRuleOffOverrides(
        "oxlint.config.ts",
        makeConfig(`{
          overrides: [
            { files: ["src/legacy.ts", "**/*.test.ts"], rules: { "project/no-foo": "off", "no-console": ["off"], eqeqeq: "error" } },
            { files: ["src/old.ts"], rules: { 'no-alert': 0, "no-debugger": "allow" } },
            { files: ["src/new.ts"], rules: { "no-console": "error" } },
          ],
        }`)
      )
    ).toStrictEqual([
      {
        files: ["src/legacy.ts", "**/*.test.ts"],
        index: 0,
        rules: ["project/no-foo", "no-console"],
      },
      { files: ["src/old.ts"], index: 1, rules: ["no-alert", "no-debugger"] },
    ])
  })

  it("read the object of a const that the default export names", () => {
    expect(
      findRuleOffOverrides(
        "oxlint.config.ts",
        [
          "const config = {",
          '  overrides: [{ files: ["a.ts"], rules: { "no-console": "off" } }],',
          "} satisfies object",
          "",
          "export default config",
          "",
        ].join("\n")
      )
    ).toStrictEqual([{ files: ["a.ts"], index: 0, rules: ["no-console"] }])
  })

  it("keep the positions of the overrides before a spread, and skip the others", () => {
    expect(
      findRuleOffOverrides(
        "oxlint.config.ts",
        makeConfig(`{
          overrides: [
            vitestOverride,
            { files: getFiles(), rules: { "no-console": "off" } },
            { files: ["b.ts"], rules: { "no-console": "off" } },
            ...shared,
            { files: ["c.ts"], rules: { "no-console": "off" } },
          ],
        }`)
      )
    ).toStrictEqual([{ files: ["b.ts"], index: 2, rules: ["no-console"] }])
  })

  it.each([
    ["a config without overrides", makeConfig("{ rules: {} }")],
    ["a config that does not parse", "export default {"],
    ["overrides that code builds", makeConfig("{ overrides: makeOverrides() }")],
  ])("find none in %s", (_, content) => {
    expect(findRuleOffOverrides("oxlint.config.ts", content)).toStrictEqual([])
  })
})
