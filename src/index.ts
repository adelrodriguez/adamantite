import process from "node:process"
import * as Command from "@effect/cli/Command"
import * as NodeContext from "@effect/platform-node/NodeContext"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as CommandExecutor from "@effect/platform/CommandExecutor"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import analyzeCommand from "#commands/analyze.ts"
import checkCommand from "#commands/check.ts"
import fixCommand from "#commands/fix.ts"
import formatCommand from "#commands/format.ts"
import initCommand from "#commands/init.ts"
import monorepoCommand from "#commands/monorepo.ts"
import typecheckCommand from "#commands/typecheck.ts"
import updateCommand from "#commands/update.ts"
import { CwdLive } from "#services/cwd.ts"
import { Prompter, PrompterLive } from "#services/prompter.ts"
import { getPackageVersion } from "#version.ts" with { type: "macro" }

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

const program = Command.run(main, { name: "adamantite", version })

program(process.argv)
  .pipe(
    Effect.as(CommandExecutor.ExitCode(0)),
    Effect.catchTag("CommandFailed", (error) => Effect.succeed(error.exitCode)),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const prompter = yield* Prompter
        const message =
          "message" in error && error.message ? error.message : "An unexpected error occurred."
        yield* prompter.log.error(message)
        return CommandExecutor.ExitCode(1)
      })
    )
  )
  .pipe(
    Effect.provide(Layer.mergeAll(NodeContext.layer, PrompterLive, CwdLive)),
    NodeRuntime.runMain({
      teardown: (exit, onExit) => {
        onExit(Exit.isSuccess(exit) ? (exit.value as number) : 1)
      },
    })
  )
