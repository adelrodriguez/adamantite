import { describe, expect, test } from "bun:test"
import { toOxfmtTsConfigContent } from "#lib/workspace/tooling/oxfmt.ts"

describe("toOxfmtTsConfigContent", () => {
  test("preserve nested oxfmt overrides when merging from the preset", () => {
    const content = toOxfmtTsConfigContent({
      sortImports: {
        order: "desc",
      },
    })

    expect(content).toContain("  sortImports: {")
    expect(content).toContain("    ...format.sortImports,")
    expect(content).toContain('    order: "desc"')
  })
})
