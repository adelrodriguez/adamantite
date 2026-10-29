import { readFileSync } from "node:fs"

/**
 * Build-time macro that inlines `warning-report.md` into the bundle, so Doctor never reads the
 * template from disk at run time.
 */
export function getWarningReportTemplate(): string {
  return readFileSync(new URL("warning-report.md", import.meta.url), "utf8")
}
