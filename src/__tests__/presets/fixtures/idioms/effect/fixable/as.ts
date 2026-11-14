import { Effect } from "effect"

export const done = Effect.succeed(1).pipe(Effect.map(() => "done"))
