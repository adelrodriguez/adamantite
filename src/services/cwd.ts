import process from "node:process"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ServiceMap from "effect/ServiceMap"

export class Cwd extends ServiceMap.Service<
  Cwd,
  {
    readonly get: Effect.Effect<string>
  }
>()("Cwd") {
  static readonly layer = Layer.succeed(this)({
    get: Effect.sync(() => process.cwd()),
  })
}
