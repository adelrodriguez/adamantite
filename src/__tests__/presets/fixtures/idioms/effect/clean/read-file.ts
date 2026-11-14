import { Effect, FileSystem, Path } from "effect"

export const readSettings = Effect.fn("readSettings")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  return yield* fs.readFileString(path.join(root, "settings.json"))
})
