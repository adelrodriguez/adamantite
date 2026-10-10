import { describe, expect, it } from "vitest"
import { type ProjectAssessment, renderAssessmentMarkdown } from "#lib/assessment/index.ts"

function makeAssessment(value: Partial<ProjectAssessment>): ProjectAssessment {
  return {
    applicableIntegrations: ["tool"],
    findings: [],
    packageActions: [],
    warnings: [],
    ...value,
  }
}

describe("renderAssessmentMarkdown", () => {
  it("render one combined prompt with safety and verification instructions", () => {
    const prompt = renderAssessmentMarkdown(
      makeAssessment({
        findings: [
          {
            currentState: "`tool.config.ts` is missing.",
            goal: ["Create `tool.config.ts`.", "Preserve project settings."],
            id: "missing-tool-config",
            integration: "tool",
            notes: ["Do not replace custom rules."],
            reference: {
              content: '{ "extends": "adamantite/typescript" }\n',
              language: "json",
            },
            title: "Missing tool configuration",
          },
        ],
        warnings: ["Found two competing tool configurations."],
      }),
      "1.2.3"
    )

    expect(prompt).toBe(
      [
        "# Adamantite doctor findings",
        "",
        "This project uses Adamantite 1.2.3 to manage linting, formatting, and type tooling.",
        "`adamantite doctor` found 1 issue(s). Fix them so that `adamantite doctor` exits 0.",
        "",
        "## Assessment warnings",
        "",
        "Account for these warnings while fixing the findings:",
        "",
        "- Found two competing tool configurations.",
        "",
        "## 1. Missing tool configuration",
        "",
        "- **Current state:** `tool.config.ts` is missing.",
        "- **Goal:**",
        "  - Create `tool.config.ts`.",
        "  - Preserve project settings.",
        "- **Reference:**",
        "",
        "```json",
        '{ "extends": "adamantite/typescript" }',
        "```",
        "- **Notes:**",
        "  - Do not replace custom rules.",
        "",
        "## Verify",
        "",
        "Run `adamantite doctor` — through your package runner, such as `npx` or `pnpm exec`, if it is not on PATH.",
        "All findings above must be gone and it must exit 0.",
        "Do not suppress or work around checks; fix the underlying state.",
        "",
      ].join("\n")
    )
  })

  it("omit the Notes section when a finding has no notes", () => {
    const prompt = renderAssessmentMarkdown(
      makeAssessment({
        findings: [
          {
            currentState: "`tool.config.ts` is missing.",
            goal: ["Create `tool.config.ts`."],
            id: "missing-tool-config",
            integration: "tool",
            notes: [],
            title: "Missing tool configuration",
          },
        ],
      }),
      "1.2.3"
    )

    expect(prompt).not.toContain("**Notes:**")
  })

  it("render the warning report when no findings remain", () => {
    const report = renderAssessmentMarkdown(
      makeAssessment({ warnings: ["Skipping `tsconfig.json` setup."] }),
      "1.2.3"
    )

    expect(report).toContain("# Adamantite doctor warnings")
    expect(report).toContain("found no repair findings")
    expect(report).toContain("- Skipping `tsconfig.json` setup.")
    expect(report).not.toContain("# Adamantite doctor findings")
  })
})
