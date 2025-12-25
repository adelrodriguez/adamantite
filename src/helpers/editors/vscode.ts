import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Fault } from "faultier"
import { err, fromPromise, ok, safeTry } from "neverthrow"
import { checkIfExists, isJsonObject, mergeConfig, parseJson } from "#utils.ts"

export const vscode = {
  config: {
    "typescript.tsdk": "node_modules/typescript/lib",
    "editor.formatOnSave": true,
    "editor.formatOnPaste": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.oxc": "explicit",
    },
    "[javascript][typescript][javascriptreact][typescriptreact][json][jsonc][css][graphql]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
  },
  exists: () => checkIfExists(join(process.cwd(), ".vscode", "settings.json")),
  create: () =>
    safeTry(async function* () {
      const vscodePath = join(process.cwd(), ".vscode")
      // Create .vscode directory if it doesn't exist
      yield* fromPromise(mkdir(vscodePath, { recursive: true }), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_CREATE_DIRECTORY")
          .withDescription(
            "Failed to create .vscode directory",
            "We're unable to create the .vscode directory in the current directory."
          )
          .withContext({ path: vscodePath })
      )

      yield* fromPromise(
        writeFile(join(vscodePath, "settings.json"), JSON.stringify(vscode.config, null, 2)),
        (error) =>
          Fault.wrap(error)
            .withTag("FAILED_TO_WRITE_FILE")
            .withDescription(
              "Failed to write .vscode/settings.json",
              "We're unable to write the .vscode/settings.json file in the current directory."
            )
      )

      return ok()
    }),

  update: () =>
    safeTry(async function* () {
      const vscodePath = join(process.cwd(), ".vscode", "settings.json")

      const vscodeFile = yield* fromPromise(readFile(vscodePath, "utf8"), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_READ_FILE")
          .withDescription(
            "Failed to read .vscode/settings.json",
            "We're unable to read the .vscode/settings.json file in the current directory."
          )
          .withContext({ path: vscodePath })
      )

      const existingConfig = yield* parseJson(vscodeFile)

      // Merge config: Adamantite's config takes precedence (first argument in defu)
      // This ensures Adamantite's settings are always applied
      // Empty configs are allowed and will be merged with Adamantite's config
      if (!isJsonObject(existingConfig)) {
        return err(
          Fault.create("INVALID_CONFIG_FORMAT").withDescription(
            "Invalid .vscode/settings.json format",
            "The VS Code settings file must be a JSON object."
          )
        )
      }
      const newConfig = yield* mergeConfig(vscode.config, existingConfig)

      yield* fromPromise(
        writeFile(
          join(process.cwd(), ".vscode", "settings.json"),
          JSON.stringify(newConfig, null, 2)
        ),
        (error) =>
          Fault.wrap(error)
            .withTag("FAILED_TO_WRITE_FILE")
            .withDescription(
              "Failed to write .vscode/settings.json",
              "We're unable to write the .vscode/settings.json file in the current directory."
            )
            .withContext({ path: vscodePath })
      )

      return ok()
    }),
}
