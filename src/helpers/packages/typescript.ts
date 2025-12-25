import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Fault } from "faultier"
import { err, fromPromise, ok, safeTry } from "neverthrow"
import { checkIfExists, isJsonObject, mergeConfig, parseJson } from "#utils.ts"

export const typescript = {
  name: "tsc",
  config: { extends: "adamantite/typescript" },
  exists: () => checkIfExists(join(process.cwd(), "tsconfig.json")),
  create: () =>
    fromPromise(
      writeFile(join(process.cwd(), "tsconfig.json"), JSON.stringify(typescript.config, null, 2)),
      (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_WRITE_FILE")
          .withDescription(
            "Failed to write tsconfig.json",
            "We're unable to write the tsconfig.json file in the current directory."
          )
    ),

  update: () =>
    safeTry(async function* () {
      const tsconfigFile = yield* fromPromise(
        readFile(join(process.cwd(), "tsconfig.json"), "utf8"),
        (error) =>
          Fault.wrap(error)
            .withTag("FAILED_TO_READ_FILE")
            .withDescription(
              "Failed to read tsconfig.json",
              "We're unable to read the tsconfig.json file in the current directory."
            )
      )
      const existingConfig = yield* parseJson(tsconfigFile)

      // Merge config: Adamantite's config takes precedence (first argument in defu)
      // This ensures Adamantite's extends is always applied
      // Empty configs are allowed and will be merged with Adamantite's config
      if (!isJsonObject(existingConfig)) {
        return err(
          Fault.create("INVALID_CONFIG_FORMAT").withDescription(
            "Invalid tsconfig.json format",
            "The tsconfig.json file must be a JSON object."
          )
        )
      }
      const newConfig = yield* mergeConfig(typescript.config, existingConfig)

      yield* fromPromise(
        writeFile(join(process.cwd(), "tsconfig.json"), JSON.stringify(newConfig, null, 2)),
        (error) =>
          Fault.wrap(error)
            .withTag("FAILED_TO_WRITE_FILE")
            .withDescription(
              "Failed to write tsconfig.json",
              "We're unable to write the tsconfig.json file in the current directory."
            )
      )

      return ok()
    }),
}
