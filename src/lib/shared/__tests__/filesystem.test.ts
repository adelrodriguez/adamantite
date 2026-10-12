import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import {
  ensureDirectory,
  readDirectoryIfExists,
  readFile,
  readFileIfExists,
  writeFile,
} from "#lib/shared/filesystem.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("filesystem", () => {
  it.effect("return FailedToCreateDirectory when ensureDirectory cannot create the path", () =>
    Effect.gen(function* () {
      const files = makeFiles()
      files.makeReadOnly(".github")
      const path = `${ROOT}/.github/workflows`

      const error = yield* ensureDirectory(path).pipe(provideFiles(files), Effect.flip)

      expect(error).toMatchObject({ _tag: "FailedToCreateDirectory", path })
    })
  )

  it.effect("return FailedToReadFile when readFile reads a missing file", () =>
    Effect.gen(function* () {
      const path = `${ROOT}/missing.json`

      const error = yield* readFile(path).pipe(provideFiles(makeFiles()), Effect.flip)

      expect(error).toMatchObject({ _tag: "FailedToReadFile", path })
    })
  )

  it.effect("return none when readFileIfExists reads a missing file", () =>
    Effect.gen(function* () {
      const content = yield* readFileIfExists(`${ROOT}/missing.json`).pipe(
        provideFiles(makeFiles())
      )

      expect(content).toStrictEqual(Option.none())
    })
  )

  it.effect("return FailedToReadFile when readFileIfExists fails for another reason", () =>
    Effect.gen(function* () {
      const files = makeFiles({ "directory/file.txt": "" })
      const path = `${ROOT}/directory`

      const error = yield* readFileIfExists(path).pipe(provideFiles(files), Effect.flip)

      expect(error).toMatchObject({ _tag: "FailedToReadFile", path })
    })
  )

  it.effect("return none when readDirectoryIfExists reads a missing path or a file", () =>
    Effect.gen(function* () {
      const files = makeFiles({ "file.txt": "" })

      const missing = yield* readDirectoryIfExists(`${ROOT}/missing`).pipe(provideFiles(files))
      const file = yield* readDirectoryIfExists(`${ROOT}/file.txt`).pipe(provideFiles(files))

      expect(missing).toStrictEqual(Option.none())
      expect(file).toStrictEqual(Option.none())
    })
  )

  it.effect("return FailedToReadFile when readDirectoryIfExists fails for another reason", () =>
    Effect.gen(function* () {
      const path = `${ROOT}/locked`
      const fileSystemLayer = FileSystem.layerNoop({
        readDirectory: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "PermissionDenied",
              method: "readDirectory",
              module: "FileSystem",
              pathOrDescriptor: path,
            })
          ),
      })

      const error = yield* readDirectoryIfExists(path).pipe(
        Effect.provide(fileSystemLayer),
        Effect.flip
      )

      expect(error).toMatchObject({ _tag: "FailedToReadFile", path })
    })
  )

  it.effect("return FailedToWriteFile when writeFile cannot write the path", () =>
    Effect.gen(function* () {
      const files = makeFiles()
      files.makeReadOnly("config.json")
      const path = `${ROOT}/config.json`

      const error = yield* writeFile(path, "{}").pipe(provideFiles(files), Effect.flip)

      expect(error).toMatchObject({ _tag: "FailedToWriteFile", path })
    })
  )
})
