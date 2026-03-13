import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import type { Script } from "#lib/workspace/scripts.ts"
import { type CommandFailedLike, CommandRunner } from "#lib/services/command-runner.ts"
import {
  FailedToCreateDirectory,
  FailedToInstallExtension,
  FailedToReadFile,
  FailedToWriteFile,
  InvalidConfigFormat,
  VscodeCliNotFound,
} from "#lib/shared/errors.ts"
import { isJsonObject, mergeConfig, parseJson } from "#lib/shared/json.ts"

const SETTINGS_FILE = "settings.json"

export const vscode = {
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
  },
  create: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const vscodePath = path.join(cwd, ".vscode")
      const settingsPath = path.join(vscodePath, SETTINGS_FILE)

      // Create .vscode directory if it doesn't exist
      yield* fs
        .makeDirectory(vscodePath, { recursive: true })
        .pipe(Effect.mapError((cause) => new FailedToCreateDirectory({ cause, path: vscodePath })))

      yield* fs
        .writeFileString(settingsPath, `${JSON.stringify(vscode.config, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: settingsPath })))
    }),
  exists: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      return yield* fs.exists(path.join(cwd, ".vscode", SETTINGS_FILE))
    }),

  extension: (scripts: Script[] = []) =>
    Effect.gen(function* () {
      function installExtension(extension: string) {
        return Effect.gen(function* () {
          const runner = yield* CommandRunner
          const exitCode = yield* runner
            .run({
              args: ["--install-extension", extension],
              command: "code",
            })
            .pipe(
              Effect.mapError((cause: CommandFailedLike) =>
                cause._tag === "CliNotFound" && cause.command === "code"
                  ? new VscodeCliNotFound({ cause })
                  : new FailedToInstallExtension({ cause, extension })
              )
            )

          if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
            return yield* new FailedToInstallExtension({ cause: exitCode, extension })
          }
        })
      }

      const extensions: string[] = []

      if (scripts.includes("check") || scripts.includes("fix") || scripts.includes("format")) {
        extensions.push("oxc.oxc-vscode")
      }

      if (scripts.includes("analyze")) {
        extensions.push("webpro.vscode-knip")
      }

      for (const extension of extensions) {
        yield* installExtension(extension)
      }
    }),
  update: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const vscodePath = path.join(cwd, ".vscode", SETTINGS_FILE)

      const vscodeFile = yield* fs
        .readFileString(vscodePath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: vscodePath })))

      const existingConfig = yield* parseJson(vscodeFile, vscodePath)

      // Merge config: Adamantite's config takes precedence (first argument in defu)
      // This ensures Adamantite's settings are always applied
      // Empty configs are allowed and will be merged with Adamantite's config
      if (!isJsonObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: vscodePath })
      }

      const newConfig = yield* mergeConfig(vscode.config, existingConfig)

      yield* fs
        .writeFileString(vscodePath, `${JSON.stringify(newConfig, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: vscodePath })))
    }),
}
