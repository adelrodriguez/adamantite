import { describe, expect, it } from "@effect/vitest"
import { codingAgents } from "#lib/execution/coding-agents.ts"
import { getShippedSkillFiles } from "#lib/execution/skill.macro.ts"
import { CUSTOM_RULES_SECTION } from "#lib/shared/skill.ts"

describe("shipped skill", () => {
  it("have the section that the prompts name", () => {
    // AGENTS.md, rule add, and the harden prompt send agents to this section by its name.
    expect(getShippedSkillFiles()["SKILL.md"]).toMatch(
      new RegExp(`^## ${CUSTOM_RULES_SECTION}$`, "mu")
    )
  })

  it("name each skill folder that init writes in the setup guide", () => {
    // The setup guide tells agents where `--agents` writes the skill, so a new agent folder must
    // reach it.
    const { "references/setup.md": setup } = getShippedSkillFiles()
    const folders = [...new Set(codingAgents.map((agent) => agent.skillsFolder))]

    expect(folders.filter((folder) => !String(setup).includes(`\`${folder}\``))).toStrictEqual([])
  })
})
