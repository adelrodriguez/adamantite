import { describe, expect, test } from "bun:test"
import { biome, sherif } from "../src/commands/helpers"

describe("update command", () => {
  test("should have correct version constants", () => {
    expect(biome.version).toBe("2.1.4")
    expect(sherif.version).toBe("1.6.1")
  })
})