import { describe, expect, it } from "vitest"
import { renderFindingsPrompt } from "#lib/shared/findings.ts"

describe("renderFindingsPrompt", () => {
  it("render one combined prompt with safety and verification instructions", () => {
    const prompt = renderFindingsPrompt(
      [
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
      "1.2.3",
      ["Found two competing tool configurations."]
    )

    expect(prompt).toContain("This project uses Adamantite 1.2.3")
    expect(prompt).toContain("make sure the working tree is clean")
    expect(prompt).toContain("## 1. Missing tool configuration")
    expect(prompt).toContain("## Assessment warnings")
    expect(prompt).toContain("- Found two competing tool configurations.")
    expect(prompt).toContain('```json\n{ "extends": "adamantite/typescript" }\n```')
    expect(prompt).toContain("Do not suppress or work around checks")
  })

  it("omit the Notes section when a finding has no notes", () => {
    const prompt = renderFindingsPrompt(
      [
        {
          currentState: "`tool.config.ts` is missing.",
          goal: ["Create `tool.config.ts`."],
          id: "missing-tool-config",
          integration: "tool",
          notes: [],
          title: "Missing tool configuration",
        },
      ],
      "1.2.3"
    )

    expect(prompt).not.toContain("**Notes:**")
  })
})
