import { FileSystem, Path, Command as ShellCommand } from "@effect/platform"
import { Effect } from "effect"
import type { Script } from "#types.ts"
import {
  FailedToCreateDirectory,
  FailedToInstallExtension,
  FailedToReadFile,
  FailedToWriteFile,
  InvalidConfigFormat,
  VscodeCliNotFound,
} from "#errors.ts"
import { checkCliExists, isJsonObject, mergeConfig, parseJson } from "#utils.ts"

const SETTINGS_FILE = "settings.json"

export const vscode = {
  cliExists: () =>
    checkCliExists("code").pipe(Effect.mapError((cause) => new VscodeCliNotFound({ cause }))),
  config: {
    "[css]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[graphql]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[javascript]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[javascriptreact]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[json]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[jsonc]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[typescript]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[typescriptreact]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "editor.codeActionsOnSave": {
      "source.fixAll.oxc": "explicit",
    },
    "editor.defaultFormatter": "oxc.oxc-vscode",
    "editor.formatOnPaste": true,
    "editor.formatOnSave": true,
    "oxc.typeAware": true,
    "typescript.tsdk": "node_modules/typescript/lib",
  },
  create: () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const vscodePath = path.join(process.cwd(), ".vscode")
      const settingsPath = path.join(vscodePath, SETTINGS_FILE)

      // Create .vscode directory if it doesn't exist
      yield* fs
        .makeDirectory(vscodePath, { recursive: true })
        .pipe(Effect.mapError((cause) => new FailedToCreateDirectory({ cause, path: vscodePath })))

      yield* fs
        .writeFileString(settingsPath, `${JSON.stringify(vscode.config, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: settingsPath })))
    }),
  exists: () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      return yield* fs.exists(path.join(process.cwd(), ".vscode", SETTINGS_FILE))
    }),

  extension: (scripts: Script[] = []) =>
    Effect.gen(function* () {
      yield* vscode.cliExists()

      const installExtension = (extension: string) =>
        ShellCommand.make("code", "--install-extension", extension).pipe(
          ShellCommand.stdout("inherit"),
          ShellCommand.stderr("inherit"),
          ShellCommand.exitCode,
          Effect.mapError((cause) => new FailedToInstallExtension({ cause, extension }))
        )

      const extensions = [
        scripts.includes("check") || scripts.includes("fix") || scripts.includes("format")
          ? installExtension("oxc.oxc-vscode")
          : Effect.void,
        scripts.includes("analyze") ? installExtension("webpro.vscode-knip") : Effect.void,
        scripts.includes("typecheck")
          ? installExtension("TypeScriptTeam.native-preview")
          : Effect.void,
      ]

      const results = yield* Effect.all(extensions, { mode: "either" })
      const firstFailure = results.find((r) => r._tag === "Left")

      if (firstFailure) {
        yield* Effect.fail(firstFailure.left)
      }
    }),
  update: () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const vscodePath = path.join(process.cwd(), ".vscode", SETTINGS_FILE)

      const vscodeFile = yield* fs
        .readFileString(vscodePath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: vscodePath })))

      const existingConfig = yield* parseJson(vscodeFile, vscodePath)

      // Merge config: Adamantite's config takes precedence (first argument in defu)
      // This ensures Adamantite's settings are always applied
      // Empty configs are allowed and will be merged with Adamantite's config
      if (!isJsonObject(existingConfig)) {
        return yield* Effect.fail(new InvalidConfigFormat({ path: vscodePath }))
      }

      const newConfig = yield* mergeConfig(vscode.config, existingConfig)

      yield* fs
        .writeFileString(vscodePath, `${JSON.stringify(newConfig, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: vscodePath })))
    }),
}
