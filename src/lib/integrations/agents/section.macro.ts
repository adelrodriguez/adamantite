import { readFileSync } from "node:fs"

/**
 * Build-time macro that inlines `section.md` into the bundle, so `init` never reads the template
 * from disk at run time.
 */
export function getAgentsSectionTemplate(): string {
  return readFileSync(new URL("section.md", import.meta.url), "utf8")
}
