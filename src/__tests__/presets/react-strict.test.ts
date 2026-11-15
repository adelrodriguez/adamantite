import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import reactStrict from "#presets/lint/react-strict.ts"
import { listFixtureRules } from "./rule-fixtures.ts"

const FIXTURES_DIR = join(import.meta.dirname, "fixtures/react-strict")
const NAMESPACE = "adamantite"

const presetRules = Object.keys(reactStrict.rules ?? {}).filter((name) =>
  name.startsWith(`${NAMESPACE}/`)
)

describe("react-strict preset", () => {
  it("have fixtures for exactly the rules the preset enables", () => {
    expect(listFixtureRules(FIXTURES_DIR)).toStrictEqual(
      EffectArray.sort(presetRules, Order.String)
    )
  })
})
