import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Runtime from "effect/Runtime"
import * as Stdio from "effect/Stdio"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { runCli } from "#cli.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { Prompter } from "#terminal/prompter.ts"

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
      DependencyInstaller.layer,
      TerminalCapabilities.layer
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
