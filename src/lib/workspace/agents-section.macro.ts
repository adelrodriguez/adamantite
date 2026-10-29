import { readFileSync } from "node:fs"

/**
 * Build-time macro that inlines `agents-section.md` into the bundle, so `init` never reads the
 * template from disk at run time.
 */
export function getAgentsSectionTemplate(): string {
  return readFileSync(new URL("agents-section.md", import.meta.url), "utf8")
}
