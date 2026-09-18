import { resolve } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
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
    const diagnostics = Effect.runSync(
      parseOxlintDiagnostics(JSON.stringify({ diagnostics: [raw] }), "/project")
    )

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

  it("accept a parse error, which has no rule code", () => {
    const raw = {
      filename: "src/broken.ts",
      labels: [{ label: "`}` expected", span: { column: 1, length: 0, line: 2, offset: 12 } }],
      message: "Expected `}` but found `EOF`",
      severity: "error",
    }
    const diagnostics = Effect.runSync(
      parseOxlintDiagnostics(JSON.stringify({ diagnostics: [raw] }), "/project")
    )

    expect(diagnostics).toMatchObject([{ line: 2, rule: "oxc(parse-error)" }])
  })

  it("reject malformed reporter output at the input boundary", () => {
    const error = Effect.runSync(
      Effect.flip(parseOxlintDiagnostics('{"diagnostics":[{"code":4}]}', "/project"))
    )

    expect(error.message).toContain("could not parse")
  })
})
