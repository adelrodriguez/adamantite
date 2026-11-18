import { readFileSync } from "node:fs"

/**
 * Build-time macro that inlines `harden-prompt.md` into the bundle, so `harden` never reads the
 * template from disk at run time.
 */
export function getHardenPromptTemplate(): string {
  return readFileSync(new URL("harden-prompt.md", import.meta.url), "utf8")
}

/**
 * Build-time macro that inlines the enforcement ladder of the shipped Adamantite skill, without its
 * title, so the harden prompt and the skill state the ladder from one file.
 */
export function getEnforcementLadder(): string {
  const reference = readFileSync(
    new URL("../../../skills/adamantite/references/enforcement-ladder.md", import.meta.url),
    "utf8"
  )

  return reference.slice(reference.indexOf("\n") + 1).trim()
}
