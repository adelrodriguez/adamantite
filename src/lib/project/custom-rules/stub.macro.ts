import { readFileSync } from "node:fs"

export function getStubTemplate(): string {
  return readFileSync(new URL("stub.ts.template", import.meta.url), "utf8")
}

export function getTestStubTemplate(): string {
  return readFileSync(new URL("stub.test.ts.template", import.meta.url), "utf8")
}
