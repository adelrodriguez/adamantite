import { describe, expect, test } from "bun:test"
import Bun from "bun"
import { BIOME_VERSION } from "../cli/utils"

// Define regex at top level for performance
const SCHEMA_VERSION_REGEX = /\/schemas\/([^/]+)\/schema\.json$/

describe("biome", () => {
  test("biome.jsonc $schema version should match @biomejs/biome package version", async () => {
    // Read package.json to get the biome dependency version
    const packageJson = await Bun.file("package.json").json()
    const biomeVersion = packageJson.devDependencies?.["@biomejs/biome"]

    // Read biome.jsonc to get the schema URL
    const biomeConfigContent = await Bun.file("biome.jsonc").text()

    // Parse biome.jsonc (strip comments for JSON parsing)
    const cleanedContent = biomeConfigContent
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n")

    const biomeConfig = JSON.parse(cleanedContent)
    const schemaUrl = biomeConfig.$schema

    // Extract version from schema URL
    // Expected format: "https://biomejs.dev/schemas/{version}/schema.json"
    const schemaVersionMatch = schemaUrl.match(SCHEMA_VERSION_REGEX)

    expect(schemaVersionMatch).not.toBeNull()
    expect(schemaVersionMatch).toHaveLength(2)

    const schemaVersion = schemaVersionMatch[1]

    // Compare versions
    expect(schemaVersion).toBe(biomeVersion)
  })

  test("BIOME_VERSION constant should match package.json @biomejs/biome version", async () => {
    // Read package.json to get the biome dependency version
    const packageJson = await Bun.file("package.json").json()
    const packageBiomeVersion = packageJson.devDependencies?.["@biomejs/biome"]

    // Compare the constant with the package.json version
    expect(BIOME_VERSION).toBe(packageBiomeVersion)
  })
})
