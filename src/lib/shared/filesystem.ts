import type * as Schema from "effect/Schema"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import {
  FailedToCreateDirectory,
  FailedToDeleteFile,
  FailedToReadFile,
  FailedToWriteFile,
} from "#lib/shared/errors.ts"

export const ensureDirectory = (path: string) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.makeDirectory(path, { recursive: true })),
    Effect.mapError((cause) => new FailedToCreateDirectory({ cause, path }))
  )

export const readFile = (path: string) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.readFileString(path)),
    Effect.mapError((cause) => new FailedToReadFile({ cause, path }))
  )

/**
 * Reads a file that may not exist. A missing file is `Option.none`; every other failure is a
 * `FailedToReadFile`. Reading directly instead of checking `exists` first keeps the operation
 * atomic.
 */
export const readFileIfExists = (path: string) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.readFileString(path)),
    Effect.map((content) => pipe(content, Option.some)),
    Effect.catch((error) =>
      error.reason._tag === "NotFound"
        ? Effect.succeedNone
        : Effect.fail(new FailedToReadFile({ cause: error, path }))
    )
  )

export const writeFile = (path: string, content: string) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.writeFileString(path, content)),
    Effect.mapError((cause) => new FailedToWriteFile({ cause, path }))
  )

/**
 * Writes a value as two-space-indented JSON with a trailing newline, the format every
 * Adamantite-managed JSON file uses.
 */
export const writeJsonFile = (path: string, value: Schema.Json) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`)

export const removeFile = (path: string) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.remove(path)),
    Effect.mapError((cause) => new FailedToDeleteFile({ cause, path }))
  )
