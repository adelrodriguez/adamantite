import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Runtime from "effect/Runtime"
import * as Command from "effect/unstable/cli/Command"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import analyzeCommand from "#commands/analyze.ts"
import checkCommand from "#commands/check.ts"
import fixCommand from "#commands/fix.ts"
import formatCommand from "#commands/format.ts"
import initCommand from "#commands/init.ts"
import monorepoCommand from "#commands/monorepo.ts"
import typecheckCommand from "#commands/typecheck.ts"
import updateCommand from "#commands/update.ts"
import { CommandRunner } from "#lib/services/command-runner.ts"
import { DependencyInstaller } from "#lib/services/dependency-installer.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { getPackageVersion } from "#version.macro.ts" with { type: "macro" }

const main = Command.make("adamantite").pipe(
  Command.withDescription("Opinionated preset package for modern TypeScript applications"),
  Command.withSubcommands([
    analyzeCommand,
    checkCommand,
    fixCommand,
    formatCommand,
    initCommand,
    monorepoCommand,
    typecheckCommand,
    updateCommand,
  ])
)

const version = await getPackageVersion()

const program = Command.run(main, { version }).pipe(
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
