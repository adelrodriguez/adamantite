import { describe, expect, it } from "vitest"
import { FIRST_PARTY_PLUGINS, firstPartyPlugin } from "#presets/lint/plugins/entry.ts"

describe("first-party plugin entry", () => {
  it.each(FIRST_PARTY_PLUGINS)("load the %s plugin from the folder with its name", async (name) => {
    expect.hasAssertions()

    const entry = firstPartyPlugin(name)
    const module: { default: { meta: { name: string } } } = await import(entry.specifier)

    expect(entry.name).toBe(name)
    expect(module.default.meta.name).toBe(name)
  })
})
