import { readFileSync } from "node:fs"

export function getAgentsSectionTemplate(): string {
  return readFileSync(new URL("section.md", import.meta.url), "utf8")
}
