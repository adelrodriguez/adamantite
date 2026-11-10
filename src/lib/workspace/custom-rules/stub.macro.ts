import { readFileSync } from "node:fs"

/**
 * Build-time macro that inlines `stub.ts.template` into the bundle, so `rule add` never reads the
 * template from disk at run time.
 */
export function getStubTemplate(): string {
  return readFileSync(new URL("stub.ts.template", import.meta.url), "utf8")
}

/**
 * Inline the optional test template. Only `rule test add` writes it.
 */
export function getTestStubTemplate(): string {
  return readFileSync(new URL("stub.test.ts.template", import.meta.url), "utf8")
}
