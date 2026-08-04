import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import analyzeCommand from "#commands/analyze.ts"
import checkCommand from "#commands/check.ts"
import doctorCommand from "#commands/doctor.ts"
import fixCommand from "#commands/fix.ts"
import formatCommand from "#commands/format.ts"
import initCommand from "#commands/init.ts"
import monorepoCommand from "#commands/monorepo.ts"
import typecheckCommand from "#commands/typecheck.ts"
import updateCommand from "#commands/update.ts"
import { ForwardedArguments } from "#lib/services/forwarded-arguments.ts"
import { PassthroughNotSupported } from "#lib/shared/errors.ts"

const passthroughCommands = [
  analyzeCommand,
  checkCommand,
  fixCommand,
  formatCommand,
  monorepoCommand,
  typecheckCommand,
] as const

const commands = [
  analyzeCommand,
  checkCommand,
  doctorCommand,
  fixCommand,
  formatCommand,
  initCommand,
  monorepoCommand,
  typecheckCommand,
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

interface SplitArguments {
  readonly command: readonly string[]
  readonly forwarded: readonly string[]
}

function splitArguments(args: readonly string[]): SplitArguments {
  const separatorIndex = args.indexOf("--")

  if (separatorIndex === -1) {
    return {
      command: args,
      forwarded: [],
    }
  }

  return {
    command: args.slice(0, separatorIndex),
    forwarded: args.slice(separatorIndex + 1),
  }
}

export const runCli = Effect.fn("runCli")(function* (args: readonly string[], version: string) {
  const split = splitArguments(args)
  const activeCommand = split.command.find((argument) => commandNames.has(argument))

  if (
    split.forwarded.length > 0 &&
    activeCommand !== undefined &&
    !passthroughCommandNames.has(activeCommand)
  ) {
    return yield* new PassthroughNotSupported({ command: activeCommand })
  }

  yield* Command.runWith(main, { version })(split.command).pipe(
    Effect.provideService(ForwardedArguments, split.forwarded)
  )
})
