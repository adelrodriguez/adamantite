import process from "node:process"
import { Command } from "@effect/cli"
import { Runtime } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import * as Exit from "effect/Exit"
import analyze from "#commands/analyze.ts"
import check from "#commands/check.ts"
import fix from "#commands/fix.ts"
import format from "#commands/format.ts"
import init from "#commands/init.ts"
import monorepo from "#commands/monorepo.ts"
import typecheck from "#commands/typecheck.ts"
import update from "#commands/update.ts"
import { CwdLive } from "#services/cwd.ts"
import { PrompterLive } from "#services/prompter.ts"
import { getPackageVersion } from "#version.ts" with { type: "macro" }

const main = Command.make("adamantite").pipe(
  Command.withDescription("Opinionated preset package for modern TypeScript applications"),
  Command.withSubcommands([analyze, check, fix, format, init, monorepo, typecheck, update])
)

const version = await getPackageVersion()

const program = Command.run(main, { name: "adamantite", version })

const teardown: Runtime.Teardown = (exit, onExit) => {
  if (Exit.isSuccess(exit)) {
    const value = exit.value

    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255) {
      onExit(value)
      return
    }
  }

  Runtime.defaultTeardown(exit, onExit)
}

const exitCode = program(process.argv).pipe(
  Effect.as(0),
  Effect.catchTag("CommandFailed", (error) => Effect.succeed(error.exitCode)),
  Effect.tapErrorCause((cause) => Effect.logError(cause)),
  Effect.catchAll(() => Effect.succeed(1))
)

exitCode.pipe(
  Effect.provide(Layer.mergeAll(NodeContext.layer, PrompterLive, CwdLive)),
  NodeRuntime.runMain({ teardown })
)
