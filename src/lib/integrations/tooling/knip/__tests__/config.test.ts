import { describe, expect, it } from "@effect/vitest"
import { IGNORED_ENTRIES } from "#lib/integrations/tooling/knip/config.ts"
import { ignoreDependencies } from "#presets/analyze.ts"

describe("Knip ignore lists", () => {
  it("check the lists and entries that the analyze preset publishes", () => {
    // Doctor checks these entries in a project's knip.config.ts, so a list or an entry that the
    // preset adds must reach the check.
    expect(IGNORED_ENTRIES).toStrictEqual(ignoreDependencies)
  })
})
