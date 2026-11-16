import { describe, expect, it } from "@effect/vitest"
import { declarations } from "#lib/integrations/oxlint/replacements.ts"

describe("declarations", () => {
  // A declaration that does not decode drops out without an error, so each one is listed here.
  it("list each first-party rule that declares the config it replaces", () => {
    expect(
      declarations.map(({ plugin, replacement, rule }) => ({
        kind: replacement.kind,
        plugin,
        rule,
      }))
    ).toStrictEqual([{ kind: "overrides", plugin: "adamantite", rule: "adamantite/layers" }])
  })
})
