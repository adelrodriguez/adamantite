import { Effect } from "effect"

export const doubled = Effect.succeed(2).pipe(Effect.map((value) => value * 2))
