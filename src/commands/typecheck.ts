import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { oxlint } from "#lib/integrations/tooling/oxlint.ts"
import { CommandRunner } from "#lib/services/command-runner.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { CommandFailed } from "#lib/shared/errors.ts"

export default Command.make("typecheck").pipe(
  Command.withDescription("Deprecated alias for `check`"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const runner = yield* CommandRunner

      yield* prompter.log.warning("Deprecated. Use `adamantite check` for typechecking.")

      const exitCode = yield* runner.run({
        args: [],
        command: oxlint.name,
      })

      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        yield* new CommandFailed({ command: oxlint.name, exitCode })
      }
    })
  )
)
