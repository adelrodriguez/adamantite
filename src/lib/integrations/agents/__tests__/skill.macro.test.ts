import { describe, expect, it } from "@effect/vitest"
import { codingAgents } from "#lib/handoff/coding-agents.ts"
import { getShippedSkillFiles } from "#lib/integrations/agents/skill.macro.ts"
import { CORRECTIONS_SECTION, CUSTOM_RULES_SECTION } from "#lib/shared/skill.ts"

describe("shipped skill", () => {
  it.each([CUSTOM_RULES_SECTION, CORRECTIONS_SECTION])(
    "have the %s section that the prompts name",
    (section) => {
      // AGENTS.md, rule add, and the harden prompt send agents to these sections by their names.
      expect(getShippedSkillFiles()["SKILL.md"]).toMatch(new RegExp(`^## ${section}$`, "mu"))
    }
  )

  it("name each skill folder that init writes in the setup guide", () => {
    // The setup guide tells agents where `--agents` writes the skill, so a new agent folder must
    // reach it.
    const { "references/setup.md": setup } = getShippedSkillFiles()
    const folders = [...new Set(codingAgents.map((agent) => agent.skillsFolder))]

    expect(folders.filter((folder) => !String(setup).includes(`\`${folder}\``))).toStrictEqual([])
  })
})
