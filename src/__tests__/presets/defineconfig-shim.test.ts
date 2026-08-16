import { describe, expect, test } from "bun:test"
import { defineConfig } from "oxlint"

// The build replaces oxlint's defineConfig with an identity shim so compiled
// presets stay importable without oxlint installed (see tsdown.config.ts).
// This pins the assumption: an oxlint release that makes defineConfig
// normalize or copy the config must fail here, not ship silently.
describe("oxlint defineConfig", () => {
  test("returns the config unchanged, matching the build shim", () => {
    const config = { rules: {} }

    expect(defineConfig(config)).toBe(config)
  })
})
