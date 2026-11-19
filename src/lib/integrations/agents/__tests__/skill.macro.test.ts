import { describe, expect, it } from "@effect/vitest"
import { codingAgents } from "#lib/handoff/coding-agents.ts"
import { getShippedSkillFiles } from "#lib/integrations/agents/skill.macro.ts"
import { CORRECTIONS_SECTION, CUSTOM_RULES_SECTION, HARDENING_SKILL } from "#lib/shared/skill.ts"

const files = getShippedSkillFiles()

const skills = [...new Set(Object.keys(files).map((file) => file.slice(0, file.indexOf("/"))))]

function toAnchor(heading: string) {
  return heading
    .toLowerCase()
    .replaceAll(/[^\d a-z-]/gu, "")
    .replaceAll(" ", "-")
}

function listBrokenLinks() {
  return Object.entries(files).flatMap(([file, content]) => {
    const skill = file.slice(0, file.indexOf("/"))
    const folder = file.slice(0, file.lastIndexOf("/"))

    return [...content.matchAll(/\]\((?!https?:)([^)#\s]*)(?:#([^)\s]+))?\)/gu)].flatMap(
      ([link, path = "", anchor]) => {
        const target = path === "" ? file : new URL(path, `file:///${folder}/`).pathname.slice(1)

        const headings = [...(files[target] ?? "").matchAll(/^#+ (.+)$/gmu)].map(
          ([, heading = ""]) => toAnchor(heading)
        )

        const resolves =
          target.startsWith(`${skill}/`)
          && target in files
          && (anchor === undefined || headings.includes(anchor))

        return resolves ? [] : [`${file}: ${link}`]
      }
    )
  })
}

describe("shipped skills", () => {
  it("ship the toolchain skill and the hardening skill", () => {
    expect(new Set(skills)).toStrictEqual(new Set(["adamantite", HARDENING_SKILL]))
  })

  it.each(skills)("name the %s skill after its folder", (skill) => {
    expect(files[`${skill}/SKILL.md`]).toMatch(new RegExp(`^name: ${skill}$`, "mu"))
  })

  it.each([CUSTOM_RULES_SECTION, CORRECTIONS_SECTION])(
    "have the %s section that the prompts name",
    (section) => {
      expect(files[`${HARDENING_SKILL}/SKILL.md`]).toMatch(new RegExp(`^## ${section}$`, "mu"))
    }
  )

  // An agent installs and loads one skill folder at a time, so a link into another skill can lead
  // nowhere.
  it("link only to files and headings of the same skill", () => {
    expect(listBrokenLinks()).toStrictEqual([])
  })

  it("name each skill folder that init writes in the setup guide", () => {
    const { "adamantite/references/setup.md": setup } = files
    const folders = [...new Set(codingAgents.map((agent) => agent.skillsFolder))]

    expect(folders.filter((folder) => !String(setup).includes(`\`${folder}\``))).toStrictEqual([])
  })
})
