import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Fault } from "faultier"
import { err, fromPromise, ok, safeTry } from "neverthrow"
import { checkIfExists, mergeConfig, parseJson } from "#utils.ts"

export const biome = {
  name: "@biomejs/biome",
  version: "2.3.10",
  config: {
    // Ensures that the schema always matches the installed version of Biome
    $schema: "./node_modules/@biomejs/biome/configuration_schema.json",
  },
  exists: async () => {
    if (await checkIfExists(join(process.cwd(), "biome.jsonc"))) {
      return { path: join(process.cwd(), "biome.jsonc") }
    }

    if (await checkIfExists(join(process.cwd(), "biome.json"))) {
      return { path: join(process.cwd(), "biome.json") }
    }

    return { path: null }
  },
  create: () =>
    fromPromise(
      writeFile(
        join(process.cwd(), "biome.jsonc"),
        JSON.stringify({ ...biome.config, extends: ["adamantite"] }, null, 2)
      ),
      (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_WRITE_FILE")
          .withDescription(
            "Failed to write Biome configuration",
            "We're unable to write the Biome configuration to the current directory."
          )
    ),
  update: () =>
    safeTry(async function* () {
      const exists = await biome.exists()

      if (!exists.path) {
        return err(
          Fault.create("FILE_NOT_FOUND").withDescription(
            "No `biome.jsonc` or `biome.json` found",
            "We're unable to find a Biome configuration in the current directory."
          )
        )
      }

      const biomeFile = yield* fromPromise(readFile(exists.path, "utf-8"), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_READ_FILE")
          .withDescription(
            "Failed to read Biome configuration",
            "We're unable to read the Biome configuration from the current directory."
          )
      )

      const existingConfig = yield* parseJson(biomeFile)

      if (!existingConfig || Object.keys(existingConfig).length === 0) {
        return err(
          Fault.create("INVALID_BIOME_CONFIG")
            .withDescription(
              "Invalid Biome configuration",
              "The Biome configuration file is empty or invalid."
            )
            .withContext({ path: exists.path })
        )
      }

      // Clone the existing config
      const newConfig = { ...existingConfig }

      if (!Array.isArray(newConfig.extends)) {
        // Ensure extends is an array
        newConfig.extends = newConfig.extends ? [newConfig.extends] : []
      }

      if (!newConfig.extends.includes("adamantite")) {
        // Only add "adamantite" if it's not already present
        newConfig.extends.push("adamantite")
      }

      // Merge other config properties (like $schema) - our config overrides existing
      const mergedConfig = yield* mergeConfig([biome.config, newConfig], {
        path: exists.path,
        configName: "Biome",
      })

      yield* fromPromise(
        writeFile(join(process.cwd(), "biome.jsonc"), JSON.stringify(mergedConfig, null, 2)),
        (error) =>
          Fault.wrap(error)
            .withTag("FAILED_TO_WRITE_FILE")
            .withDescription(
              "Failed to write Biome configuration",
              "We're unable to write the Biome configuration to the current directory."
            )
      )

      return ok()
    }),
}
