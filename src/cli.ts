import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Array from "effect/Array"
import * as Cause from "effect/Cause"
import * as Command from "effect/cli/Command"
import * as Digest from "effect/crypto/Digest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { CommandRunner } from "#lib/shared/command-runner.ts"
import analyzeCommand from "#commands/analyze.ts"
import checkCommand from "#commands/check.ts"
import doctorCommand from "#commands/doctor.ts"
import fixCommand from "#commands/fix.ts"
import hardenCommand from "#commands/harden.ts"
import initCommand from "#commands/init.ts"
import ruleCommand from "#commands/rule.ts"
import updateCommand from "#commands/update.ts"
import { CodingAgents } from "#lib/handoff/coding-agents.ts"
import { ConfigLoader } from "#lib/project/config-loader.ts"
import { DependencyInstaller } from "#lib/project/dependency-installer.ts"
import * as Project from "#lib/project/index.ts"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { NodeVersionResolver } from "#lib/project/node-version-resolver.ts"
import { PassthroughNotSupported } from "#lib/shared/errors.ts"
import { ForwardedArguments } from "#lib/shared/forwarded-arguments.ts"
import * as Output from "#terminal/output.ts"

const passthroughCommands = [analyzeCommand, checkCommand, fixCommand] as const

const commands = [
  analyzeCommand,
  checkCommand,
  doctorCommand,
  fixCommand,
  hardenCommand,
  initCommand,
  ruleCommand,
  updateCommand,
] as const

const commandNames: ReadonlySet<string> = new Set(commands.map((command) => command.name))

const passthroughCommandNames: ReadonlySet<string> = new Set(
  passthroughCommands.map((command) => command.name)
)

const main = Command.make("adamantite").pipe(
  Command.withDescription("Configure code checks for TypeScript projects"),
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
    ModuleResolver.layer,
    ConfigLoader.layer.pipe(Layer.provide(NodeServices.layer)),
    CodingAgents.layer.pipe(Layer.provideMerge(runner), Layer.provide(NodeServices.layer)),
    DependencyInstaller.layer.pipe(Layer.provide(NodeServices.layer)),
    Digest.layerWebCrypto,
    // Harden gives the agent the date of today, in the time zone of the user.
    DateTime.layerCurrentZoneLocal,
    Project.Directory.layer
  )

/**
 * Reports the cause that ended the CLI, and returns the exit code. `Output.failures` prints each
 * typed error. A defect or an interruption in the same cause is not an error that a command
 * expected, so it fails again without the typed errors, and the runtime reports it: a defect with
 * its stack and exit code 1, and an interruption with exit code 130.
 */
export function reportFailure<E extends { readonly message: string }>(cause: Cause.Cause<E>) {
  // A defect or an interruption holds no typed error, which inference cannot see from the reasons.
  const unexpected = Cause.fromReasons<never>(
    cause.reasons.flatMap((reason) => (Cause.isFailReason(reason) ? [] : [reason]))
  )

  return Output.failures(cause).pipe(
    Effect.filterOrElse(
      () => unexpected.reasons.length === 0,
      () => Effect.failCause(unexpected)
    )
  )
}

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
