import { resolve } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import { parseKnipDiagnostics } from "#lib/agent-repair/analyze.ts"

describe("parseKnipDiagnostics", () => {
  it("decode flat and nested Knip issues", () => {
    const output = JSON.stringify({
      issues: [
        {
          dependencies: [{ col: 4, line: 2, name: "unused-package" }],
          duplicates: [[{ name: "first" }, { name: "second" }]],
          file: "src/index.ts",
        },
      ],
    })

    expect(parseKnipDiagnostics(output, "/project")).toEqual([
      {
        column: 4,
        file: resolve("/project", "src/index.ts"),
        line: 2,
        message: "unused-package",
        raw: { col: 4, line: 2, name: "unused-package" },
        stage: "unused",
        type: "dependencies",
      },
      {
        column: undefined,
        file: resolve("/project", "src/index.ts"),
        line: undefined,
        message: "first",
        raw: { name: "first" },
        stage: "unused",
        type: "duplicates",
      },
      {
        column: undefined,
        file: resolve("/project", "src/index.ts"),
        line: undefined,
        message: "second",
        raw: { name: "second" },
        stage: "unused",
        type: "duplicates",
      },
    ])
  })

  it("reject malformed reporter output at the input boundary", () => {
    expect(() => parseKnipDiagnostics('{"issues":[{"file":4}]}', "/project")).toThrow(
      "could not parse"
    )
  })
})
