import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { publicImport } from "#lib/shared/package-exports.ts"
import packageJson from "../../../../package.json" with { type: "json" }

describe("publicImport", () => {
  it("accept exactly the subpaths in the export map", () => {
    expectTypeOf<Parameters<typeof publicImport>[0]>().toEqualTypeOf<
      keyof typeof packageJson.exports
    >()
  })

  it("reject a built module that the package keeps private", () => {
    expectTypeOf<"./lint/core">().not.toExtend<Parameters<typeof publicImport>[0]>()
  })

  it("name the package before the subpath", () => {
    expect(publicImport("./lint")).toBe("adamantite/lint")
    expect(publicImport("./rules/plugin")).toBe("adamantite/rules/plugin")
  })
})
