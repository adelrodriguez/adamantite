import { describe, expect, test } from "bun:test"
import { toKnipTsConfigContent } from "#lib/workspace/knip-config.ts"

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
})
