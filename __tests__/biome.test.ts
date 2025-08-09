import { describe, expect, test } from "bun:test"
import Bun from "bun"
import { getBiomeVersion } from "../src/utils"

const SCHEMA_VERSION_REGEX = /\/schemas\/([^/]+)\/schema\.json$/
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/
const SEMVER_RANGE_REGEX = /[\^~><=]/

describe("biome", () => {
  test("biome.jsonc schema version matches package version", async () => {
    const biomeConfigContent = await Bun.file("biome.jsonc").text()
    const cleanedContent = biomeConfigContent
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n")

    const biomeConfig = JSON.parse(cleanedContent)
    const schemaUrl = biomeConfig.$schema
    const schemaVersionMatch = schemaUrl.match(SCHEMA_VERSION_REGEX)

    expect(schemaVersionMatch).not.toBeNull()
    const schemaVersion = schemaVersionMatch[1]
    const packageVersion = await getBiomeVersion()

    expect(schemaVersion).toBe(packageVersion)
  })

  test("getBiomeVersion returns exact version without semver prefixes", async () => {
    const version = await getBiomeVersion()

    expect(typeof version).toBe("string")
    expect(version).toMatch(SEMVER_REGEX)
    expect(version).not.toMatch(SEMVER_RANGE_REGEX)
  })
})
