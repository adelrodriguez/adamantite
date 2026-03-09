import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
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

  extension: (_cwd: string, scripts: Script[] = []) =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* vscode.cliExists()

        function installExtension(extension: string) {
          return Effect.gen(function* () {
            const handle = yield* ChildProcess.make("code", ["--install-extension", extension], {
              stderr: "inherit",
              stdin: "ignore",
              stdout: "inherit",
            })
            return yield* handle.exitCode
          }).pipe(
            Effect.mapError((cause) => new FailedToInstallExtension({ cause, extension })),
            Effect.filterOrFail(
              (exitCode) => exitCode === ChildProcessSpawner.ExitCode(0),
              (exitCode) => new FailedToInstallExtension({ cause: exitCode, extension })
            ),
            Effect.asVoid
          )
        }

        const extensions = [
          scripts.includes("check") || scripts.includes("fix") || scripts.includes("format")
            ? installExtension("oxc.oxc-vscode")
            : Effect.void,
          scripts.includes("analyze") ? installExtension("webpro.vscode-knip") : Effect.void,
        ]

        const results = yield* Effect.all(
          extensions.map((extension) =>
            extension.pipe(
              Effect.match({
                onFailure: (error) => error,
                onSuccess: () => null,
              })
            )
          )
        )
        const firstFailure = results.find((result) => result !== null)

        if (firstFailure) {
          yield* Effect.fail(firstFailure)
        }
      })
    ),
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
        return yield* Effect.fail(new InvalidConfigFormat({ path: vscodePath }))
      }

      const newConfig = yield* mergeConfig(vscode.config, existingConfig)

      yield* fs
        .writeFileString(vscodePath, `${JSON.stringify(newConfig, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: vscodePath })))
    }),
}
