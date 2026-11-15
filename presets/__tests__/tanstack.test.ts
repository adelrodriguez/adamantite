import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import tanstack from "#presets/lint/tanstack.ts"
import { listFixtureRules } from "./rule-fixtures.ts"

const FIXTURES_DIR = join(import.meta.dirname, "../../src/__tests__/presets/fixtures/tanstack")
const NAMESPACE = "adamantite"

const presetRules = Object.keys(tanstack.rules ?? {}).filter((name) =>
  name.startsWith(`${NAMESPACE}/`)
)

describe("tanstack preset", () => {
  it("have fixtures for exactly the rules the preset enables", () => {
    expect(listFixtureRules(FIXTURES_DIR)).toStrictEqual(
      EffectArray.sort(presetRules, Order.String)
    )
  })
})
