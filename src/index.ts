import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Runtime from "effect/Runtime"
import * as Stdio from "effect/Stdio"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { runCli } from "#cli.ts"
import { CommandRunner } from "#lib/services/command-runner.ts"
import { DependencyInstaller } from "#lib/services/dependency-installer.ts"
import { NodeVersionResolver } from "#lib/services/node-version-resolver.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

const version = getPackageVersion()

const program = Effect.gen(function* () {
  const stdio = yield* Stdio.Stdio
  const args = yield* stdio.args

  yield* runCli(args, version)
}).pipe(
  Effect.as(0),
  Effect.catchTag("CommandFailed", (error) => Effect.succeed(error.exitCode)),
  Effect.catch((error) =>
    Effect.service(Prompter).pipe(
      Effect.flatMap((prompter) => prompter.log.error(error.message)),
      Effect.as(ChildProcessSpawner.ExitCode(1))
    )
  ),
  Effect.provide(
    Layer.mergeAll(
      NodeServices.layer,
      NodeVersionResolver.layer.pipe(Layer.provide(NodeServices.layer)),
      Prompter.layer,
      CommandRunner.layer,
      DependencyInstaller.layer
    )
  )
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
