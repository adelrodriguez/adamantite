import process from "node:process"
import { Context, Effect, Layer } from "effect"

export class Cwd extends Context.Tag("Cwd")<Cwd, { readonly get: Effect.Effect<string> }>() {}

export const CwdLive = Layer.succeed(Cwd, {
  get: Effect.sync(() => process.cwd()),
})
