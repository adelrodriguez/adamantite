import { Context, Effect, Layer } from "effect"

export class Database extends Context.Service<
  Database,
  {
    query(sql: string): Effect.Effect<ReadonlyArray<{ readonly id: number }>>
  }
>()("app/Database") {
  static readonly layer = Layer.succeed(
    Database,
    Database.of({
      query: Effect.fn("Database.query")(function* (sql: string) {
        yield* Effect.log("Executing SQL query:", sql)

        return [{ id: 1 }]
      }),
    })
  )
}
