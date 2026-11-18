import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Runtime from "effect/Runtime"
import * as Stdio from "effect/Stdio"
import { makeAppLayer, runCli } from "#cli.ts"
import { CommandRunner } from "#lib/shared/command-runner.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import * as Output from "#terminal/output.ts"

const version = getPackageVersion()

const program = Effect.gen(function* () {
  const stdio = yield* Stdio.Stdio
  const args = yield* stdio.args

  yield* runCli(args, version)
}).pipe(
  Effect.as(0),
  // A defect or an interruption keeps the runtime's report.
  Effect.catchCauseIf(Cause.hasFails, Output.failures),
  Effect.provide(makeAppLayer(CommandRunner.layer))
)

NodeRuntime.runMain(program, {
  teardown: (exit, onExit) => {
    if (Exit.isSuccess(exit)) {
      onExit(Number(exit.value))

      return
    }

    Runtime.defaultTeardown(exit, onExit)
  },
})
