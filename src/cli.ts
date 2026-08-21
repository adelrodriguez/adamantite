import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import analyzeCommand from "#commands/analyze.ts"
import checkCommand from "#commands/check.ts"
import doctorCommand from "#commands/doctor.ts"
import fixCommand from "#commands/fix.ts"
import formatCommand from "#commands/format.ts"
import initCommand from "#commands/init.ts"
import monorepoCommand from "#commands/monorepo.ts"
import updateCommand from "#commands/update.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import { PassthroughNotSupported } from "#lib/shared/errors.ts"

const passthroughCommands = [
  analyzeCommand,
  checkCommand,
  fixCommand,
  formatCommand,
  monorepoCommand,
] as const

const commands = [
  analyzeCommand,
  checkCommand,
  doctorCommand,
  fixCommand,
  formatCommand,
  initCommand,
  monorepoCommand,
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

export const runCli = Effect.fn("runCli")(function* (args: readonly string[], version: string) {
  const [commandArguments, forwardedWithSeparator] = Array.splitWhere(
    args,
    (argument) => argument === "--"
  )
  const forwardedArguments = Array.drop(forwardedWithSeparator, 1)
  const activeCommand = commandArguments.find((argument) => commandNames.has(argument))

  if (
    forwardedArguments.length > 0 &&
    activeCommand !== undefined &&
    !passthroughCommandNames.has(activeCommand)
  ) {
    return yield* new PassthroughNotSupported({ command: activeCommand })
  }

  yield* Command.runWith(main, { version })(commandArguments).pipe(
    Effect.provideService(ForwardedArguments, forwardedArguments)
  )
})
