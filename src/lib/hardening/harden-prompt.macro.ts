import { readFileSync } from "node:fs"

/**
 * Build-time macro that inlines `harden-prompt.md` into the bundle, so `harden` never reads the
 * template from disk at run time.
 */
export function getHardenPromptTemplate(): string {
  return readFileSync(new URL("harden-prompt.md", import.meta.url), "utf8")
}
