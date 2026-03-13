import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { FailedToCreateDirectory } from "#lib/shared/errors.ts"

export const ensureDirectory = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    yield* fs
      .makeDirectory(path, { recursive: true })
      .pipe(Effect.mapError((cause) => new FailedToCreateDirectory({ cause, path })))
  })
