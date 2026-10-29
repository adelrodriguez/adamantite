import { readFileSync } from "node:fs"

/**
 * Build-time macro that inlines `config.ts.template` into the bundle, so `init` never reads the
 * template from disk at run time.
 */
export function getConfigTemplate(): string {
  return readFileSync(new URL("config.ts.template", import.meta.url), "utf8")
}
