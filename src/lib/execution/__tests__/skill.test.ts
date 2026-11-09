import { describe, expect, it } from "@effect/vitest"
import { getShippedSkillFiles } from "#lib/execution/skill.macro.ts"
import { CUSTOM_RULES_SECTION } from "#lib/shared/skill.ts"

describe("shipped skill", () => {
  it("have the section that the prompts name", () => {
    // AGENTS.md, rule add, and the harden prompt send agents to this section by its name.
    expect(getShippedSkillFiles()["SKILL.md"]).toMatch(
      new RegExp(`^## ${CUSTOM_RULES_SECTION}$`, "mu")
    )
  })
})
