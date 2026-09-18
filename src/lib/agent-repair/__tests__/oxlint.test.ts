import { resolve } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import { parseOxlintDiagnostics } from "#lib/agent-repair/oxlint.ts"

describe("parseOxlintDiagnostics", () => {
  it("parse the JSON reporter shape", () => {
    const raw = {
      code: "eslint(no-console)",
      filename: "src/index.ts",
      help: "Remove the console call.",
      labels: [{ span: { column: 3, length: 7, line: 4, offset: 20 } }],
      message: "Unexpected console statement.",
      severity: "error",
      url: "https://oxc.rs/rule",
    }
    const diagnostics = parseOxlintDiagnostics(JSON.stringify({ diagnostics: [raw] }), "/project")

    expect(diagnostics).toEqual([
      {
        column: 3,
        file: resolve("/project", "src/index.ts"),
        help: "Remove the console call.",
        line: 4,
        message: "Unexpected console statement.",
        raw,
        rule: "eslint(no-console)",
        url: "https://oxc.rs/rule",
      },
    ])
  })

  it("reject malformed reporter output at the input boundary", () => {
    expect(() => parseOxlintDiagnostics('{"diagnostics":[{"code":4}]}', "/project")).toThrow(
      "could not parse"
    )
  })
})
