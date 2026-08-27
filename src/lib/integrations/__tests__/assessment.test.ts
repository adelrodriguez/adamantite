import { describe, expect, it } from "vitest"
import { type ProjectAssessment, renderAssessmentMarkdown } from "#lib/integrations/assessment.ts"

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

    expect(prompt).toContain("# Adamantite doctor findings")
    expect(prompt).toContain("This project uses Adamantite 1.2.3")
    expect(prompt).toContain("make sure the working tree is clean")
    expect(prompt).toContain("## 1. Missing tool configuration")
    expect(prompt).toContain("## Assessment warnings")
    expect(prompt).toContain("- Found two competing tool configurations.")
    expect(prompt).toContain('```json\n{ "extends": "adamantite/typescript" }\n```')
    expect(prompt).toContain("Do not suppress or work around checks")
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
