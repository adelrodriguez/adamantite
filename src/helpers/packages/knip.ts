import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Fault } from "faultier"
import { err, fromPromise, ok, safeTry } from "neverthrow"
import preset from "#presets/knip.json" with { type: "json" }
import { checkIfExists, isJsonObject, mergeConfig, parseJson } from "#utils.ts"

export const knip = {
  config: preset,
  create: () =>
    fromPromise(
      writeFile(join(process.cwd(), "knip.json"), JSON.stringify(knip.config, null, 2)),
      (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_WRITE_FILE")
          .withDescription(
            "Failed to write knip configuration",
            "We're unable to write the knip configuration to the current directory."
          )
    ),
  exists: async () => {
    if (await checkIfExists(join(process.cwd(), "knip.json"))) {
      return { path: join(process.cwd(), "knip.json") }
    }

    if (await checkIfExists(join(process.cwd(), "knip.jsonc"))) {
      return { path: join(process.cwd(), "knip.jsonc") }
    }

    return { path: null }
  },
  name: "knip",
  update: () =>
    safeTry(async function* () {
      const exists = await knip.exists()

      if (!exists.path) {
        return err(
          Fault.create("FILE_NOT_FOUND").withDescription(
            "No `knip.json` or `knip.jsonc` found",
            "We're unable to find a knip configuration in the current directory."
          )
        )
      }

      const knipFile = yield* fromPromise(readFile(exists.path, "utf8"), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_READ_FILE")
          .withDescription(
            "Failed to read knip configuration",
            "We're unable to read the knip configuration from the current directory."
          )
      )

      const existingConfig = yield* parseJson(knipFile)

      // Empty configs are allowed and will be merged with Adamantite's config
      // Ensure existingConfig is a JSON object (not null, array, or primitive)
      if (!isJsonObject(existingConfig)) {
        return err(
          Fault.create("INVALID_CONFIG_FORMAT").withDescription(
            "Invalid knip configuration format",
            "The knip configuration must be a JSON object."
          )
        )
      }

      const mergedConfig = yield* mergeConfig(existingConfig, knip.config)

      // Set schema based on file extension
      const isJsonc = exists.path.endsWith(".jsonc")
      mergedConfig.$schema = isJsonc
        ? "https://unpkg.com/knip@5/schema-jsonc.json"
        : "https://unpkg.com/knip@5/schema.json"

      yield* fromPromise(writeFile(exists.path, JSON.stringify(mergedConfig, null, 2)), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_WRITE_FILE")
          .withDescription(
            "Failed to write knip configuration",
            "We're unable to write the knip configuration to the current directory."
          )
          .withContext({ path: exists.path })
      )

      return ok()
    }),
  version: "5.80.1",
}
