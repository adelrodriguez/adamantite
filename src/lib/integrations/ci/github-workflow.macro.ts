import { readFileSync } from "node:fs"

/**
 * Build-time macro that inlines `github-workflow.yml.template` into the bundle, so `init` never
 * reads the template from disk at run time.
 */
export function getWorkflowTemplate(): string {
  return readFileSync(new URL("github-workflow.yml.template", import.meta.url), "utf8")
}
