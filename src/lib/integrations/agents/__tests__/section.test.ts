import { describe, expect, it } from "@effect/vitest"
import { renderAgentsSection } from "#lib/integrations/agents/section.ts"

const INTRO = [
  "<!-- ADAMANTITE:START -->",
  "",
  "## Adamantite",
  "",
  "Use the `adamantite` skill for managed setup, checks, and Doctor repairs, and the `adamantite-hardening` skill for coding standards, custom rules, and hardening. If a skill is not installed, read its `SKILL.md` below `skills/` in the installed `adamantite` package.",
  "",
]

const OUTRO = [
  "- Run `adamantite doctor --json` for managed setup findings. Repair each finding and rerun Doctor to verify the result.",
  "",
  '- After you fix a regression or a mistake that a reviewer corrected before, or before you add a disable comment, follow the "Keep a fixed mistake from recurring" section of the `adamantite-hardening` skill.',
  "",
  "### Check the result",
  "",
  "- Read the output of the affected checks. Report failures or unavailable checks.",
  "- Report unresolved Doctor findings and assessment warnings separately.",
  "",
  "<!-- ADAMANTITE:END -->",
  "",
]

const PREFER_SCRIPTS = "- Prefer the package scripts Adamantite added for this workspace."

const CUSTOM_RULES =
  '- For custom rules, follow the "Custom rules" section and linked guide in the `adamantite-hardening` skill. Complete its verification and cleanup checks.'

describe("renderAgentsSection", () => {
  it("put the Doctor line right after the intro when no script is selected", () => {
    expect(renderAgentsSection({ isMonorepo: false, packageManager: "pnpm", scripts: [] })).toBe(
      [...INTRO, ...OUTRO].join("\n")
    )
  })

  it("list the scripts without the custom rules line when no script runs Oxlint", () => {
    expect(
      renderAgentsSection({ isMonorepo: true, packageManager: "pnpm", scripts: ["analyze"] })
    ).toBe(
      [
        ...INTRO,
        PREFER_SCRIPTS,
        "- Run `pnpm run analyze` after changing dependencies, imports, or exports. It also checks monorepo package consistency.",
        ...OUTRO,
      ].join("\n")
    )
  })

  it("list the scripts in their order, then the custom rules line, when a script runs Oxlint", () => {
    expect(
      renderAgentsSection({
        isMonorepo: false,
        packageManager: "pnpm",
        scripts: ["analyze", "fix", "check"],
      })
    ).toBe(
      [
        ...INTRO,
        PREFER_SCRIPTS,
        "- Run `pnpm run check` to catch formatting, lint, and type issues.",
        "- Run `pnpm run fix` to apply safe lint fixes and format code.",
        "- Run `pnpm run analyze` after changing dependencies, imports, or exports.",
        CUSTOM_RULES,
        ...OUTRO,
      ].join("\n")
    )
  })
})
