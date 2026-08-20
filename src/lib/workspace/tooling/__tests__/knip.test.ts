import { describe, expect, test } from "@effect/vitest"
import { toKnipTsConfigContent } from "#lib/workspace/tooling/knip.ts"

describe("toKnipTsConfigContent", () => {
  test("preserve nested knip rule overrides when merging from the preset", () => {
    const content = toKnipTsConfigContent({
      rules: {
        binaries: {
          severity: "error",
        },
        files: "off",
      },
    })

    expect(content).toContain("  rules: {")
    expect(content).toContain("    ...analyze.rules,")
    expect(content).toContain('    files: "off",')
    expect(content).toContain("    binaries: {")
    expect(content).toContain('        severity: "error"')
  })

  test("quote config and rule keys that are not valid identifiers", () => {
    const content = toKnipTsConfigContent({
      "lint-staged": {
        entry: ["a.js"],
      },
      rules: {
        "no-such/rule": "off",
      },
    })

    expect(content).toContain('  "lint-staged": {')
    expect(content).toContain('    "no-such/rule": "off",')
  })
})
