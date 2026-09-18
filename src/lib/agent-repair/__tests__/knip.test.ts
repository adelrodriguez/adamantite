import { resolve } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { parseKnipDiagnostics } from "#lib/agent-repair/knip.ts"

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

    expect(Effect.runSync(parseKnipDiagnostics(output, "/project"))).toEqual([
      {
        column: 4,
        file: resolve("/project", "src/index.ts"),
        line: 2,
        message: "unused-package",
        raw: { col: 4, line: 2, name: "unused-package" },
        type: "dependencies",
      },
      {
        column: undefined,
        file: resolve("/project", "src/index.ts"),
        line: undefined,
        message: "first",
        raw: { name: "first" },
        type: "duplicates",
      },
      {
        column: undefined,
        file: resolve("/project", "src/index.ts"),
        line: undefined,
        message: "second",
        raw: { name: "second" },
        type: "duplicates",
      },
    ])
  })

  it("reject malformed reporter output at the input boundary", () => {
    const error = Effect.runSync(
      Effect.flip(parseKnipDiagnostics('{"issues":[{"file":4}]}', "/project"))
    )

    expect(error.message).toContain("could not parse")
  })
})
