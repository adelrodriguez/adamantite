import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { readHardenContext, renderHardenPrompt } from "#lib/hardening/index.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { Prompter } from "#terminal/prompter.ts"

const version = getPackageVersion()

export default Command.make("harden").pipe(
  Command.withDescription(
    "Ask a coding agent to turn the project's coding standards into custom rules and instructions"
  ),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter
      const packageJson = yield* readPackageJson(cwd)

      if (!packageJson.devDependencies?.adamantite && !packageJson.dependencies?.adamantite) {
        yield* prompter.message(
          "`adamantite` is not installed in this project. Install it before running `adamantite harden`."
        )
        return yield* new CommandFailed({
          command: "harden",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }

      const context = yield* readHardenContext(cwd)

      yield* prompter.message(renderHardenPrompt(context, version))
    })
  )
)
