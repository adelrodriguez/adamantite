import process from "node:process"
import { Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import analyze from "#commands/analyze.ts"
import check from "#commands/check.ts"
import fix from "#commands/fix.ts"
import format from "#commands/format.ts"
import init from "#commands/init.ts"
import monorepo from "#commands/monorepo.ts"
import typecheck from "#commands/typecheck.ts"
import update from "#commands/update.ts"
import { CwdLive } from "#services/cwd.ts"
import { PackageManagerLive } from "#services/package-manager.ts"
import { PrompterLive } from "#services/prompter.ts"
import { getPackageVersion } from "#utils.ts"

const main = Command.make("adamantite").pipe(
  Command.withDescription("Opinionated preset package for modern TypeScript applications"),
  Command.withSubcommands([analyze, check, fix, format, init, monorepo, typecheck, update])
)

const program = Effect.gen(function* () {
  const version = yield* getPackageVersion()
  const cli = Command.run(main, { name: "adamantite", version })
  yield* cli(process.argv)
})

program.pipe(
  Effect.provide(Layer.mergeAll(NodeContext.layer, PackageManagerLive, PrompterLive, CwdLive)),
  NodeRuntime.runMain
)
