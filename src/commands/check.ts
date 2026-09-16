import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"

const files = Argument.File("files", { mustExist: true }).pipe(
  Argument.withDescription("Specific files to check (optional)"),
  Argument.variadic()
)

export default Command.make("check", { files }).pipe(
  Command.withDescription("Check formatting, code issues, and type errors"),
  Command.withHandler(({ files }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner

      yield* Effect.all(
        [
          runner.runOrFail({ args: ["--check", ...files], command: oxfmt.name }),
          runner.runOrFail({
            args: [...files, ...forwardedArguments],
            command: oxlint.name,
          }),
        ],
        { mode: "result" }
      ).pipe(
        Effect.map((results) => Result.all(results)),
        Effect.flatMap((result) => Effect.fromResult(result))
      )
    })
  )
)
