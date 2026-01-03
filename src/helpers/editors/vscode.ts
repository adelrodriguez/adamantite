import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Fault } from "faultier"
import { err, fromPromise, ok, safeTry } from "neverthrow"
import type { Script } from "#types.ts"
import {
  checkCliExists,
  checkIfExists,
  isJsonObject,
  mergeConfig,
  parseJson,
  runCommand,
} from "#utils.ts"

export const vscode = {
  config: {
    "typescript.tsdk": "node_modules/typescript/lib",
    "editor.defaultFormatter": "oxc.oxc-vscode",
    "editor.formatOnSave": true,
    "editor.formatOnPaste": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.oxc": "explicit",
    },
    "[javascript]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[typescript]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[javascriptreact]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[typescriptreact]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[json]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[jsonc]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[css]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[graphql]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
  },
  exists: () => checkIfExists(join(process.cwd(), ".vscode", "settings.json")),
  cliExists: () =>
    checkCliExists("code").mapErr((error) =>
      Fault.wrap(error)
        .withTag("VSCODE_CLI_NOT_FOUND")
        .withDescription(
          "VS Code CLI not found",
          "The 'code' CLI command is not available. Please install the VS Code command-line tools by opening VS Code and running 'Shell Command: Install code command in PATH' from the command palette (Cmd+Shift+P)."
        )
    ),
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
  extension: (scripts: Script[] = []) =>
    safeTry(function* () {
      yield* vscode.cliExists()

      if (scripts.includes("check") || scripts.includes("fix") || scripts.includes("format")) {
        // Always install the core OXC extension
        yield* runCommand("code --install-extension oxc.oxc-vscode").mapErr((error) =>
          Fault.wrap(error)
            .withTag("FAILED_TO_INSTALL_EXTENSION")
            .withDescription(
              "Failed to install VS Code extension",
              "An error occurred while installing the VS Code extension."
            )
        )
      }

      // Install Knip extension when analyze is selected
      if (scripts.includes("analyze")) {
        yield* runCommand("code --install-extension webpro.vscode-knip").mapErr((error) =>
          Fault.wrap(error)
            .withTag("FAILED_TO_INSTALL_EXTENSION")
            .withDescription(
              "Failed to install VS Code extension",
              "An error occurred while installing the VS Code extension."
            )
        )
      }

      // Install TypeScript Native Preview when typecheck is selected
      if (scripts.includes("typecheck")) {
        yield* runCommand("code --install-extension TypeScriptTeam.native-preview").mapErr(
          (error) =>
            Fault.wrap(error)
              .withTag("FAILED_TO_INSTALL_EXTENSION")
              .withDescription(
                "Failed to install VS Code extension",
                "An error occurred while installing the VS Code extension."
              )
        )
      }

      return ok()
    }),
}
