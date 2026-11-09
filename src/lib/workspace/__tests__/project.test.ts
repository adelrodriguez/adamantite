import { describe, expectTypeOf, it } from "@effect/vitest"
import { readProject } from "#lib/workspace/project.ts"

describe("readProject", () => {
  it("read every part of the snapshot itself", () => {
    // A manifest that the caller read before an install or a handoff would mix two phases in one
    // snapshot, so the caller can pass only the project folder.
    expectTypeOf(readProject).parameters.toEqualTypeOf<[cwd: string]>()
  })
})
