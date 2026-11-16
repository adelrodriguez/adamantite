import { describe, expectTypeOf, it } from "@effect/vitest"
import type { publicImport } from "#lib/shared/package-exports.ts"
import packageJson from "../../../../package.json" with { type: "json" }

describe("publicImport", () => {
  it("accept exactly the subpaths in the export map", () => {
    expectTypeOf<Parameters<typeof publicImport>[0]>().toEqualTypeOf<
      keyof typeof packageJson.exports
    >()
  })
})
