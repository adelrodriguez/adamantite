import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { CI_SCRIPTS, SCRIPT_ORDER, type Script } from "#lib/project/package-json.ts"

describe("managed scripts", () => {
  it("order every managed script, and run the CI scripts in that order", () => {
    // A new managed script must get a place in the order.
    expectTypeOf<(typeof SCRIPT_ORDER)[number]>().toEqualTypeOf<Script>()
    expect(SCRIPT_ORDER).toStrictEqual(["check", "fix", "analyze"])
    expect(CI_SCRIPTS).toStrictEqual(["check", "analyze"])
  })
})
