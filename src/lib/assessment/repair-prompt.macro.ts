import { readFileSync } from "node:fs"

export function getRepairPromptTemplate(): string {
  return readFileSync(new URL("repair-prompt.md", import.meta.url), "utf8")
}
