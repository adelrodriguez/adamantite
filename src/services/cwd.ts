import process from "node:process"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export class Cwd extends Context.Tag("Cwd")<Cwd, { readonly get: Effect.Effect<string> }>() {}

export const CwdLive = Layer.succeed(Cwd, {
  get: Effect.sync(() => process.cwd()),
})
