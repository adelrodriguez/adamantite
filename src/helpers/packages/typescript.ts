import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Fault } from "faultier"
import { fromPromise, ok, safeTry } from "neverthrow"
import { checkIfExists, mergeConfig, parseJson } from "#utils.ts"

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
        readFile(join(process.cwd(), "tsconfig.json"), "utf-8"),
        (error) =>
          Fault.wrap(error)
            .withTag("FAILED_TO_READ_FILE")
            .withDescription(
              "Failed to read tsconfig.json",
              "We're unable to read the tsconfig.json file in the current directory."
            )
      )
      const existingConfig = yield* parseJson(tsconfigFile)

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
