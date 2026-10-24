import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { readHardenContext, renderHardenPrompt } from "#lib/hardening/index.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { Prompter } from "#terminal/prompter.ts"
import { chooseResolution } from "#terminal/resolution-menu.ts"

const version = getPackageVersion()

export default Command.make("harden").pipe(
  Command.withDescription(
    "Ask a coding agent to turn the project's coding standards into custom rules and instructions"
  ),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter
      const terminal = yield* TerminalCapabilities
      const isInteractive = yield* terminal.isInteractive

      if (isInteractive) {
        yield* prompter.intro("💠 adamantite harden")
      }

      const packageJson = yield* readPackageJson(cwd)

      if (!packageJson.devDependencies?.adamantite && !packageJson.dependencies?.adamantite) {
        const message =
          "`adamantite` is not installed in this project. Install it before running `adamantite harden`."
        if (isInteractive) {
          yield* prompter.log.warning(message)
          yield* prompter.outro("⚠️ Harden did not start.")
        } else {
          yield* prompter.message(message)
        }
        return yield* new CommandFailed({
          command: "harden",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }

      const context = yield* readHardenContext(cwd)
      const prompt = renderHardenPrompt(context, version)

      if (!isInteractive) {
        yield* prompter.message(prompt)
        return
      }

      const resolution = yield* chooseResolution({
        command: "Harden",
        cwd,
        message: "How do you want to harden this project?",
        prompt,
        subject: "the prompt",
      })

      if (resolution._tag === "Ended") {
        yield* prompter.outro(`✅ The ${resolution.agent.name} session ended.`)
        return
      }

      yield* prompter.outro("✅ Harden completed.")
    }).pipe(
      Effect.catchTag("OperationCancelled", () =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          yield* prompter.cancel("Harden was cancelled. Nothing was changed.")
          return yield* new CommandFailed({
            command: "harden",
            exitCode: ChildProcessSpawner.ExitCode(1),
          })
        })
      )
    )
  )
)
