import { describe, expect, it } from "@effect/vitest"
import { declarations } from "#lib/integrations/oxlint/replacements.ts"

describe("declarations", () => {
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
