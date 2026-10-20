import { readFileSync } from "node:fs"

/**
 * Build-time macro that inlines `repair-prompt.md` into the bundle, so Doctor never reads the
 * template from disk at run time.
 */
export function getRepairPromptTemplate(): string {
  return readFileSync(new URL("repair-prompt.md", import.meta.url), "utf8")
}
