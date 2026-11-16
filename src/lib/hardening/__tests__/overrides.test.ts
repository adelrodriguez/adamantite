import { describe, expectTypeOf, it } from "@effect/vitest"
import type { readOverrides } from "#lib/hardening/overrides.ts"
import type { readSuppressions } from "#lib/hardening/suppressions.ts"

describe("hardening paths", () => {
  it("take project paths, not absolute paths, for configs and the scope", () => {
    // Discovery gives absolute config paths, and `path.join(cwd, config)` of one names a file that
    // does not exist, so only a project path type-checks.
    expectTypeOf<readonly string[]>().not.toExtend<Parameters<typeof readOverrides>[2]>()
    expectTypeOf<string>().not.toExtend<Parameters<typeof readOverrides>[3]>()
    expectTypeOf<string>().not.toExtend<Parameters<typeof readSuppressions>[1]>()
  })
})
