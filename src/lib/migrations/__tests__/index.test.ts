import { describe, expect, test } from "bun:test"
import { migrations } from "#lib/migrations/index.ts"

describe("migrations", () => {
  test("exports the active migration registry in the correct order", () => {
    expect(migrations.map((m) => m.id)).toEqual([
      "legacy-oxfmt-json",
      "legacy-knip-json",
      "legacy-oxlint-json",
      "legacy-typecheck-script",
      "hardcoded-node-version",
    ])
  })
})
