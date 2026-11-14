import { Effect } from "effect"

export const doubled = Effect.succeed(2).pipe(Effect.flatMap((value) => Effect.succeed(value * 2)))
