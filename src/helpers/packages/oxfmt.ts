import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Fault } from "faultier"
import { err, fromPromise, ok, safeTry } from "neverthrow"
import preset from "#presets/oxfmt.json" with { type: "json" }
import { checkIfExists, isJsonObject, mergeConfig, parseJson } from "#utils.ts"

export const oxfmt = {
  name: "oxfmt",
  version: "0.20.0",
  config: {
    $schema: "./node_modules/oxfmt/configuration_schema.json",
    ...preset,
  },
  exists: async () => {
    if (await checkIfExists(join(process.cwd(), ".oxfmtrc.jsonc"))) {
      return { path: join(process.cwd(), ".oxfmtrc.jsonc") }
    }

    if (await checkIfExists(join(process.cwd(), ".oxfmtrc.json"))) {
      return { path: join(process.cwd(), ".oxfmtrc.json") }
    }

    return { path: null }
  },
  create: () =>
    fromPromise(
      writeFile(join(process.cwd(), ".oxfmtrc.jsonc"), JSON.stringify(oxfmt.config, null, 2)),
      (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_WRITE_FILE")
          .withDescription(
            "Failed to write oxfmt configuration",
            "We're unable to write the oxfmt configuration to the current directory."
          )
    ),
  update: () =>
    safeTry(async function* () {
      const exists = await oxfmt.exists()

      if (!exists.path) {
        return err(
          Fault.create("FILE_NOT_FOUND").withDescription(
            "No `.oxfmtrc.jsonc` or `.oxfmtrc.json` found",
            "We're unable to find an oxfmt configuration in the current directory."
          )
        )
      }

      const oxfmtFile = yield* fromPromise(readFile(exists.path, "utf8"), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_READ_FILE")
          .withDescription(
            "Failed to read oxfmt configuration",
            "We're unable to read the oxfmt configuration from the current directory."
          )
      )

      const existingConfig = yield* parseJson(oxfmtFile)

      // Empty configs are allowed and will be merged with Adamantite's config
      if (!isJsonObject(existingConfig)) {
        return err(
          Fault.create("INVALID_CONFIG_FORMAT").withDescription(
            "Invalid oxfmt configuration format",
            "The oxfmt configuration must be a JSON object."
          )
        )
      }
      const mergedConfig = yield* mergeConfig(existingConfig, oxfmt.config)
      mergedConfig.$schema = oxfmt.config.$schema

      yield* fromPromise(writeFile(exists.path, JSON.stringify(mergedConfig, null, 2)), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_WRITE_FILE")
          .withDescription(
            "Failed to write oxfmt configuration",
            "We're unable to write the oxfmt configuration to the current directory."
          )
          .withContext({ path: exists.path })
      )

      return ok()
    }),
}
