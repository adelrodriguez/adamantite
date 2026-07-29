import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import { CommandRunner } from "#lib/services/command-runner.ts"
import { ForwardedArguments } from "#lib/services/forwarded-arguments.ts"
import { CommandFailed } from "#lib/shared/errors.ts"

const files = Argument.file("files", { mustExist: true }).pipe(
  Argument.withDescription("Specific files to fix (optional)"),
  Argument.variadic()
)

const suggested = Flag.boolean("suggested").pipe(Flag.withDescription("Apply suggested fixes"))

const dangerous = Flag.boolean("dangerous").pipe(Flag.withDescription("Apply dangerous fixes"))

const all = Flag.boolean("all").pipe(
  Flag.withDescription("Apply all fixes, including suggested and dangerous fixes")
)

export default Command.make("fix", { all, dangerous, files, suggested }).pipe(
  Command.withDescription("Fix issues in code using oxlint"),
  Command.withHandler(({ all, dangerous, files, suggested }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const args = new Set<string>(["--fix"])

      if (suggested || all) {
        args.add("--fix-suggestions")
      }

      if (dangerous || all) {
        args.add("--fix-dangerously")
      }

      for (const file of files) {
        args.add(file)
      }

      const exitCode = yield* runner.run({
        args: [...args, ...forwardedArguments],
        command: oxlint.name,
      })

      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        yield* new CommandFailed({ command: oxlint.name, exitCode })
      }
    })
  )
)
