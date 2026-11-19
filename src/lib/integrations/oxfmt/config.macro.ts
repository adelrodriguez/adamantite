import { readFileSync } from "node:fs"

export function getConfigTemplate(): string {
  return readFileSync(new URL("config.ts.template", import.meta.url), "utf8")
}
