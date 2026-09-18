import type * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Command from "effect/unstable/cli/Command"
import type { CommandRunner } from "#lib/execution/command-runner.ts"
import analyzeCommand from "#commands/analyze.ts"
import checkCommand from "#commands/check.ts"
import doctorCommand from "#commands/doctor.ts"
import fixCommand from "#commands/fix.ts"
import initCommand from "#commands/init/index.ts"
import updateCommand from "#commands/update.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import { PassthroughNotSupported } from "#lib/shared/errors.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { Prompter } from "#terminal/prompter.ts"

const passthroughCommands = [analyzeCommand, checkCommand, fixCommand] as const

const commands = [
  analyzeCommand,
  checkCommand,
  doctorCommand,
  fixCommand,
  initCommand,
  updateCommand,
] as const
const commandNames: ReadonlySet<string> = new Set(commands.map((command) => command.name))
const passthroughCommandNames: ReadonlySet<string> = new Set(
  passthroughCommands.map((command) => command.name)
)

const main = Command.make("adamantite").pipe(
  Command.withDescription("Opinionated preset package for modern TypeScript applications"),
  Command.withSubcommands(commands)
)

/**
 * Every service the CLI needs. The runner is a parameter so tests exercise this exact wiring while
 * stubbing process spawning.
 */
export const makeAppLayer = (
  runner: Layer.Layer<CommandRunner, never, ChildProcessSpawner.ChildProcessSpawner>
) =>
  Layer.mergeAll(
    NodeServices.layer,
    NodeVersionResolver.layer.pipe(Layer.provide(NodeServices.layer)),
    Prompter.layer,
    runner.pipe(Layer.provide(NodeServices.layer)),
    DependencyInstaller.layer,
    TerminalCapabilities.layer
  )

export const runCli = Effect.fn("runCli")(function* (args: readonly string[], version: string) {
  const [commandArguments, forwardedWithSeparator] = Array.splitWhere(
    args,
    (argument) => argument === "--"
  )
  const forwardedArguments = Array.drop(forwardedWithSeparator, 1)
  const activeCommand = commandArguments.find((argument) => commandNames.has(argument))

  if (
    forwardedArguments.length > 0
    && activeCommand !== undefined
    && !passthroughCommandNames.has(activeCommand)
  ) {
    return yield* new PassthroughNotSupported({ command: activeCommand })
  }

  yield* Command.runWith(main, { version })(commandArguments).pipe(
    Effect.provideService(ForwardedArguments, forwardedArguments)
  )
})
