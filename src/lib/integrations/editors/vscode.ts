import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import type { Script } from "#lib/workspace/package-json.ts"
import { defineIntegration } from "#lib/integrations/base.ts"
import { type CommandFailedLike, CommandRunner } from "#lib/services/command-runner.ts"
import {
  FailedToCreateDirectory,
  FailedToInstallExtension,
  FailedToReadFile,
  FailedToWriteFile,
  InvalidConfigFormat,
  VscodeCliNotFound,
} from "#lib/shared/errors.ts"
import { mergeConfig, parseJson } from "#lib/shared/json.ts"

const files = [{ path: ".vscode/settings.json", type: "config" }] as const
const CONFIG = {
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
} as const

export default defineIntegration({
  config: files[0].path,
  create: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const settingsPath = path.join(cwd, files[0].path)
      const settingsDir = path.dirname(settingsPath)

      yield* fs
        .makeDirectory(settingsDir, { recursive: true })
        .pipe(Effect.mapError((cause) => new FailedToCreateDirectory({ cause, path: settingsDir })))

      yield* fs
        .writeFileString(settingsPath, `${JSON.stringify(CONFIG, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: settingsPath })))
    }),
  detect: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      return yield* fs.exists(path.join(cwd, files[0].path))
    }),
  extension: (scripts: Script[] = []) =>
    Effect.gen(function* () {
      const extensions: string[] = []

      if (scripts.includes("check") || scripts.includes("fix") || scripts.includes("format")) {
        extensions.push("oxc.oxc-vscode")
      }

      if (scripts.includes("analyze")) {
        extensions.push("webpro.vscode-knip")
      }

      for (const extension of extensions) {
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
      }
    }),
  files,
  kind: "editor",
  name: "vscode",
  update: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const settingsPath = path.join(cwd, files[0].path)

      const vscodeFile = yield* fs
        .readFileString(settingsPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: settingsPath })))

      const existingConfig = yield* parseJson(vscodeFile, settingsPath)

      if (!Predicate.isObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: settingsPath })
      }

      const newConfig = yield* mergeConfig(CONFIG, existingConfig)

      yield* fs
        .writeFileString(settingsPath, `${JSON.stringify(newConfig, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: settingsPath })))
    }),
})
