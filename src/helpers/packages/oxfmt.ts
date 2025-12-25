import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Fault } from "faultier"
import { err, fromPromise, ok, safeTry } from "neverthrow"
import preset from "#presets/oxfmt.json" with { type: "json" }
import { checkIfExists, mergeConfig, parseJson } from "#utils.ts"

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

      const oxfmtFile = yield* fromPromise(readFile(exists.path, "utf-8"), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_READ_FILE")
          .withDescription(
            "Failed to read oxfmt configuration",
            "We're unable to read the oxfmt configuration from the current directory."
          )
      )

      const existingConfig = yield* parseJson(oxfmtFile)

      if (!existingConfig || Object.keys(existingConfig).length === 0) {
        return err(
          Fault.create("INVALID_OXFMT_CONFIG")
            .withDescription(
              "Invalid oxfmt configuration",
              "The oxfmt configuration file is empty or invalid."
            )
            .withContext({ path: exists.path })
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
