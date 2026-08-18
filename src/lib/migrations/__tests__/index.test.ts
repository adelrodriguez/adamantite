import { describe, expect, test } from "@effect/vitest"
import { migrations } from "#lib/migrations/index.ts"

describe("migrations", () => {
  test("exports the active migration registry in the correct order", () => {
    expect(migrations.map((m) => m.id)).toEqual([
      "legacy-oxfmt-json",
      "legacy-knip-json",
      "legacy-oxlint-json",
      "removed-react-compiler-rule",
      "legacy-typecheck-script",
      "hardcoded-node-version",
    ])
  })
})
