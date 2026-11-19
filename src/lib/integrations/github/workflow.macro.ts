import { readFileSync } from "node:fs"

export function getWorkflowTemplate(): string {
  return readFileSync(new URL("workflow.yml.template", import.meta.url), "utf8")
}
