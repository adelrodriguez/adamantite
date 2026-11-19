import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import { FailedToCreateDirectory, FailedToReadFile, FailedToWriteFile } from "#lib/shared/errors.ts"

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

export const readFileIfExists = (path: string) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.readFileString(path)),
    Effect.asSome,
    Effect.catchReason(
      "PlatformError",
      "NotFound",
      () => Effect.succeedNone,
      (_reason, error) => Effect.fail(new FailedToReadFile({ cause: error, path }))
    )
  )

export const readFileIfFile = (path: string) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.readFileString(path)),
    Effect.asSome,
    Effect.catchReasons(
      "PlatformError",
      {
        // The Node.js backend of Effect reports `EISDIR` as `BadResource`.
        BadResource: () => Effect.succeedNone,
        NotFound: () => Effect.succeedNone,
      },
      (_reason, error) => Effect.fail(new FailedToReadFile({ cause: error, path }))
    )
  )

export const checkExists = (path: string) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.exists(path)),
    Effect.mapError((cause) => new FailedToReadFile({ cause, path }))
  )

export const readDirectoryIfExists = (path: string, options?: { readonly recursive?: boolean }) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.readDirectory(path, options)),
    Effect.asSome,
    Effect.catchReasons(
      "PlatformError",
      {
        // The Node.js backend of Effect reports `ENOTDIR` as `BadResource`.
        BadResource: () => Effect.succeed(Option.none<string[]>()),
        NotFound: () => Effect.succeed(Option.none<string[]>()),
      },
      (_reason, error) => Effect.fail(new FailedToReadFile({ cause: error, path }))
    )
  )

export const writeFile = (path: string, content: string) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.writeFileString(path, content)),
    Effect.mapError((cause) => new FailedToWriteFile({ cause, path }))
  )
