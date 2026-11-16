import { describe, expectTypeOf, it } from "@effect/vitest"
import type * as Toolchain from "#lib/toolchain/index.ts"

describe("Toolchain", () => {
  it("keep stage names specific to each operation", () => {
    expectTypeOf<Parameters<typeof Toolchain.check>[0]["only"]>().toEqualTypeOf<
      "format" | "lint" | undefined
    >()
    expectTypeOf<Parameters<typeof Toolchain.fix>[0]["only"]>().toEqualTypeOf<
      "format" | "lint" | undefined
    >()
    expectTypeOf<Parameters<typeof Toolchain.analyze>[0]["only"]>().toEqualTypeOf<
      "monorepo" | "unused" | undefined
    >()
  })
})
