import type * as Layer from "effect/Layer"
import { basename, dirname, relative, resolve, sep } from "node:path"
import * as EffectArray from "effect/Array"
import * as ByteSize from "effect/ByteSize"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as PlatformError from "effect/PlatformError"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"

export interface FileSystemTestContext {
  readonly root: string
  readonly layer: Layer.Layer<FileSystem.FileSystem>
  readonly exists: (path: string) => boolean
  readonly list: () => string[]
  readonly read: (path: string) => string
  readonly write: (path: string, content: string) => void
  readonly makeReadOnly: (path: string) => void
  readonly makeUnreadable: (path: string) => void
}

export function makeSystemError(tag: PlatformError.SystemErrorTag, method: string, path: string) {
  return PlatformError.systemError({
    _tag: tag,
    method,
    module: "FileSystem",
    pathOrDescriptor: path,
  })
}

function makeUnimplemented(method: string) {
  return () =>
    Effect.die(new Error(`FileSystem.${method} is not implemented in the test filesystem`))
}

function makeUnimplementedError(method: string) {
  return new Error(`FileSystem.${method} is not implemented in the test filesystem`)
}

function makeFileInfo(type: FileSystem.File.Type, size: number): FileSystem.File.Info {
  return {
    atime: Option.none(),
    birthtime: Option.none(),
    blksize: Option.none(),
    blocks: Option.none(),
    dev: 0n,
    gid: Option.none(),
    ino: Option.none(),
    mode: 0o644,
    mtime: Option.none(),
    nlink: Option.none(),
    rdev: Option.none(),
    size: ByteSize.bytes(size),
    type,
    uid: Option.none(),
  }
}

export function createFileSystemTestContext(options?: {
  readonly files?: Record<string, string>
  readonly links?: Record<string, string>
  readonly root?: string
}): FileSystemTestContext {
  const root = options?.root ?? "/project"
  const files = new Map<string, string>()
  const directories = new Set<string>([root])
  const readOnlyPaths = new Set<string>()
  const unreadablePaths = new Set<string>()
  let temporaryDirectories = 0

  for (let current = root; dirname(current) !== current; current = dirname(current)) {
    directories.add(dirname(current))
  }

  const links = Object.entries(options?.links ?? {}).map(([link, target]) => ({
    link,
    target: resolve(root, target),
  }))

  // The operating system follows a directory symlink in a path.
  function normalize(path: string) {
    const target = resolve(root, path)
    const match = links.find(({ link }) => target === link || target.startsWith(`${link}${sep}`))

    return match === undefined ? target : `${match.target}${target.slice(match.link.length)}`
  }

  // In POSIX, a read-only directory rejects writes anywhere below it.
  function checkIsReadOnly(path: string) {
    for (let current = path; ; current = dirname(current)) {
      if (readOnlyPaths.has(current)) {
        return true
      }

      if (dirname(current) === current) {
        return false
      }
    }
  }

  function addDirectoryRecursive(path: string) {
    for (let current = path; !directories.has(current); current = dirname(current)) {
      directories.add(current)
    }
  }

  function writeFixture(path: string, content: string) {
    const target = normalize(path)
    addDirectoryRecursive(dirname(target))
    files.set(target, content)
  }

  for (const [path, content] of Object.entries(options?.files ?? {})) {
    writeFixture(path, content)
  }

  const layer = FileSystem.layerNoop({
    access: makeUnimplemented("access"),
    chmod: makeUnimplemented("chmod"),
    chown: makeUnimplemented("chown"),
    copy: (fromPath, toPath, copyOptions) =>
      Effect.suspend(() => {
        const source = normalize(fromPath)
        const target = normalize(toPath)

        if (checkIsReadOnly(target)) {
          return Effect.fail(makeSystemError("PermissionDenied", "copy", toPath))
        }

        if (!files.has(source) && !directories.has(source)) {
          return Effect.fail(makeSystemError("NotFound", "copy", fromPath))
        }

        const entries = [...files].filter(
          ([file]) => file === source || file.startsWith(`${source}/`)
        )

        for (const [file, content] of entries) {
          const destination = `${target}${file.slice(source.length)}`

          if (copyOptions?.overwrite === false && files.has(destination)) {
            continue
          }

          addDirectoryRecursive(dirname(destination))
          files.set(destination, content)
        }

        if (directories.has(source)) {
          addDirectoryRecursive(target)
        }

        return Effect.void
      }),
    copyFile: makeUnimplemented("copyFile"),
    exists: (path) => {
      const target = normalize(path)

      return unreadablePaths.has(target)
        ? Effect.fail(makeSystemError("PermissionDenied", "exists", path))
        : Effect.succeed(files.has(target) || directories.has(target))
    },
    glob: makeUnimplemented("glob"),
    link: makeUnimplemented("link"),
    makeDirectory: (path, makeOptions) =>
      Effect.suspend(() => {
        const target = normalize(path)

        if (checkIsReadOnly(target)) {
          return Effect.fail(makeSystemError("PermissionDenied", "makeDirectory", path))
        }

        if (makeOptions?.recursive) {
          addDirectoryRecursive(target)

          return Effect.void
        }

        if (directories.has(target) || files.has(target)) {
          return Effect.fail(makeSystemError("AlreadyExists", "makeDirectory", path))
        }

        if (!directories.has(dirname(target))) {
          return Effect.fail(makeSystemError("NotFound", "makeDirectory", path))
        }

        directories.add(target)

        return Effect.void
      }),
    makeTempDirectory: makeUnimplemented("makeTempDirectory"),
    makeTempDirectoryScoped: (makeOptions) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          temporaryDirectories += 1

          const target = resolve("/tmp", `${makeOptions?.prefix ?? "tmp-"}${temporaryDirectories}`)

          addDirectoryRecursive(target)

          return target
        }),
        (target) =>
          Effect.sync(() => {
            for (const file of files.keys()) {
              if (file.startsWith(`${target}/`)) {
                files.delete(file)
              }
            }

            for (const directory of directories) {
              if (directory === target || directory.startsWith(`${target}/`)) {
                directories.delete(directory)
              }
            }
          })
      ),
    makeTempFile: makeUnimplemented("makeTempFile"),
    makeTempFileScoped: makeUnimplemented("makeTempFileScoped"),
    open: makeUnimplemented("open"),
    readDirectory: (path, readOptions) =>
      Effect.suspend(() => {
        const target = normalize(path)

        if (!directories.has(target)) {
          // The Node backend maps ENOTDIR to BadResource.
          return files.has(target)
            ? Effect.fail(makeSystemError("BadResource", "readDirectory", path))
            : Effect.fail(makeSystemError("NotFound", "readDirectory", path))
        }

        // A recursive listing gives paths relative to the directory, as the Node backend does.
        const children = [...files.keys(), ...directories].flatMap((entry) => {
          if (readOptions?.recursive) {
            return entry.startsWith(`${target}/`) ? [relative(target, entry)] : []
          }

          return entry !== target && dirname(entry) === target ? [basename(entry)] : []
        })

        return Effect.succeed(EffectArray.sort(new Set(children), Order.String))
      }),
    readFile: makeUnimplemented("readFile"),
    readFileString: (path) =>
      Effect.suspend(() => {
        const target = normalize(path)

        if (unreadablePaths.has(target)) {
          return Effect.fail(makeSystemError("PermissionDenied", "readFileString", path))
        }

        const content = files.get(target)

        if (content !== undefined) {
          return Effect.succeed(content)
        }

        // The Node backend maps EISDIR to BadResource.
        return directories.has(target)
          ? Effect.fail(makeSystemError("BadResource", "readFileString", path))
          : Effect.fail(makeSystemError("NotFound", "readFileString", path))
      }),
    readLink: makeUnimplemented("readLink"),
    realPath: (path) =>
      Effect.suspend(() => {
        const target = normalize(path)

        return files.has(target) || directories.has(target)
          ? Effect.succeed(target)
          : Effect.fail(makeSystemError("NotFound", "realPath", path))
      }),
    remove: (path, removeOptions) =>
      Effect.suspend(() => {
        const target = normalize(path)

        if (files.delete(target)) {
          return Effect.void
        }

        if (directories.has(target)) {
          const prefix = `${target}/`

          const hasEntries =
            [...files.keys()].some((file) => file.startsWith(prefix))
            || [...directories].some((directory) => directory.startsWith(prefix))

          if (hasEntries && !removeOptions?.recursive) {
            return Effect.fail(makeSystemError("BadResource", "remove", path))
          }

          for (const file of files.keys()) {
            if (file.startsWith(prefix)) {
              files.delete(file)
            }
          }

          for (const directory of directories) {
            if (directory === target || directory.startsWith(prefix)) {
              directories.delete(directory)
            }
          }

          return Effect.void
        }

        return removeOptions?.force
          ? Effect.void
          : Effect.fail(makeSystemError("NotFound", "remove", path))
      }),
    rename: makeUnimplemented("rename"),
    sink: () => Sink.die(makeUnimplementedError("sink")),
    stat: (path) =>
      Effect.suspend(() => {
        const target = normalize(path)
        const content = files.get(target)

        if (content !== undefined) {
          return Effect.succeed(makeFileInfo("File", content.length))
        }

        return directories.has(target)
          ? Effect.succeed(makeFileInfo("Directory", 0))
          : Effect.fail(makeSystemError("NotFound", "stat", path))
      }),
    stream: (path, streamOptions) =>
      Stream.suspend(() => {
        const target = normalize(path)
        const content = files.get(target)

        if (unreadablePaths.has(target)) {
          return Stream.fail(makeSystemError("PermissionDenied", "stream", path))
        }

        if (content === undefined) {
          return Stream.fail(makeSystemError("NotFound", "stream", path))
        }

        const bytes = new TextEncoder().encode(content)

        if (streamOptions?.offset !== undefined) {
          return Stream.die(makeUnimplementedError("stream with an offset"))
        }

        return Stream.make(
          streamOptions?.bytesToRead === undefined
            ? bytes
            : bytes.slice(0, Number(ByteSize.fromInputUnsafe(streamOptions.bytesToRead)))
        )
      }),
    symlink: makeUnimplemented("symlink"),
    truncate: makeUnimplemented("truncate"),
    utimes: makeUnimplemented("utimes"),
    watch: () => Stream.die(makeUnimplementedError("watch")),
    writeFile: makeUnimplemented("writeFile"),
    writeFileString: (path, data) =>
      Effect.suspend(() => {
        const target = normalize(path)

        if (checkIsReadOnly(target)) {
          return Effect.fail(makeSystemError("PermissionDenied", "writeFileString", path))
        }

        if (!directories.has(dirname(target))) {
          return Effect.fail(makeSystemError("NotFound", "writeFileString", path))
        }

        files.set(target, data)

        return Effect.void
      }),
  })

  return {
    exists: (path) => {
      const target = normalize(path)

      return files.has(target) || directories.has(target)
    },
    layer,
    list: () =>
      EffectArray.sort(
        Array.from(files.keys(), (path) => relative(root, path)),
        Order.String
      ),
    makeReadOnly: (path) => {
      readOnlyPaths.add(normalize(path))
    },
    makeUnreadable: (path) => {
      unreadablePaths.add(normalize(path))
    },
    read: (path) => {
      const content = files.get(normalize(path))

      if (content === undefined) {
        throw new Error(`No file in the test filesystem at ${normalize(path)}`)
      }

      return content
    },
    root,
    write: writeFixture,
  }
}
