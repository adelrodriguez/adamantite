import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect } from "effect"
import { Argument, Command } from "effect/cli"

export const greet = Command.make("greet", { name: Argument.String("name") }, ({ name }) =>
  Console.log(`Hello ${name}`)
)

export const program = greet.pipe(Command.run({ version: "1.0.0" }))

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
