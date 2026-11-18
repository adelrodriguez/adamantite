/**
 * The name of the shipped skill for coding standards, which is its folder below `skills/`. It holds
 * the two sections below.
 */
export const HARDENING_SKILL = "adamantite-hardening"

/**
 * The heading of the section in the `SKILL.md` of the hardening skill that teaches agents to write
 * custom rules. AGENTS.md, `rule add`, and the harden prompt name it, and a test checks that the
 * skill has it.
 */
export const CUSTOM_RULES_SECTION = "Custom rules"

/**
 * The heading of the section in the `SKILL.md` of the hardening skill that teaches agents what to
 * keep after they fix a mistake. AGENTS.md names it, and a test checks that the skill has it.
 */
export const CORRECTIONS_SECTION = "Keep a fixed mistake from recurring"
