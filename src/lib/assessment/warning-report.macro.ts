import { readFileSync } from "node:fs"

export function getWarningReportTemplate(): string {
  return readFileSync(new URL("warning-report.md", import.meta.url), "utf8")
}
