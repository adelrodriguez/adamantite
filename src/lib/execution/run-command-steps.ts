import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import {
  type CommandFailedLike,
  type CommandRunOptions,
  CommandRunner,
} from "#lib/execution/command-runner.ts"
import { CommandFailed } from "#lib/shared/errors.ts"

type StepFailure = CommandFailed | CommandFailedLike

export function runCommandSteps(steps: readonly CommandRunOptions[]) {
  return Effect.gen(function* () {
    const runner = yield* CommandRunner
    let firstFailure: StepFailure | undefined

    for (const step of steps) {
      const result = yield* Effect.result(runner.run(step))

      if (Result.isFailure(result)) {
        firstFailure ??= result.failure
        continue
      }

      if (result.success !== ChildProcessSpawner.ExitCode(0)) {
        firstFailure ??= new CommandFailed({
          command: step.command,
          exitCode: result.success,
        })
      }
    }

    if (firstFailure !== undefined) {
      return yield* Effect.fail(firstFailure)
    }
  })
}
