import type * as Layer from "effect/Layer"
import { dirname, resolve } from "node:path"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as PlatformError from "effect/PlatformError"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"

export interface FileSystemTestContext {
  /**
   * Absolute base directory that relative paths resolve against.
   */
  readonly root: string
  /**
   * Layer that provides the in-memory `FileSystem.FileSystem` service.
   */
  readonly layer: Layer.Layer<FileSystem.FileSystem>
  readonly exists: (path: string) => boolean
  /**
   * Read a file for assertions. Throws when the file does not exist.
   */
  readonly read: (path: string) => string
  /**
   * Write a fixture file, creating parent directories.
   */
  readonly write: (path: string, content: string) => void
  /**
   * Make writes to the path fail with a `PermissionDenied` system error.
   */
  readonly makeReadOnly: (path: string) => void
}

function makeSystemError(tag: PlatformError.SystemErrorTag, method: string, path: string) {
  return PlatformError.systemError({
    _tag: tag,
    method,
    module: "FileSystem",
    pathOrDescriptor: path,
  })
}

// makeNoop fails unimplemented operations with a typed NotFound error, which a
// Result-based test could absorb silently; die with a defect instead.
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
    dev: 0,
    gid: Option.none(),
    ino: Option.none(),
    mode: 0o644,
    mtime: Option.none(),
    nlink: Option.none(),
    rdev: Option.none(),
    size: FileSystem.Size(size),
    type,
    uid: Option.none(),
  }
}

/**
 * Creates an isolated in-memory `FileSystem` for tests. Operations the production code does not use
 * stay unimplemented and die with a defect, so a test cannot absorb them as a typed failure and
 * pass for the wrong reason.
 *
 * Missing parent directories and removals of missing paths fail with the same `SystemError` tags
 * the Node backend reports, so error-path tests exercise realistic failures without touching the
 * host filesystem.
 */
export function createFileSystemTestContext(options?: {
  readonly files?: Record<string, string>
  readonly root?: string
}): FileSystemTestContext {
  const root = options?.root ?? process.cwd()
  const files = new Map<string, string>()
  const directories = new Set<string>([root])
  const readOnlyPaths = new Set<string>()

  // Register every ancestor so strict parent-directory checks pass for roots.
  for (let current = root; dirname(current) !== current; current = dirname(current)) {
    directories.add(dirname(current))
  }

  function normalize(path: string) {
    return resolve(root, path)
  }

  // Mirrors POSIX permissions: a read-only directory rejects writes anywhere below it.
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
    copy: makeUnimplemented("copy"),
    copyFile: makeUnimplemented("copyFile"),
    exists: (path) => {
      const target = normalize(path)
      return Effect.succeed(files.has(target) || directories.has(target))
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
    makeTempDirectoryScoped: makeUnimplemented("makeTempDirectoryScoped"),
    makeTempFile: makeUnimplemented("makeTempFile"),
    makeTempFileScoped: makeUnimplemented("makeTempFileScoped"),
    open: makeUnimplemented("open"),
    readDirectory: makeUnimplemented("readDirectory"),
    readFile: makeUnimplemented("readFile"),
    readFileString: (path) =>
      Effect.suspend(() => {
        const content = files.get(normalize(path))

        return content === undefined
          ? Effect.fail(makeSystemError("NotFound", "readFileString", path))
          : Effect.succeed(content)
      }),
    readLink: makeUnimplemented("readLink"),
    realPath: makeUnimplemented("realPath"),
    remove: (path, removeOptions) =>
      Effect.suspend(() => {
        const target = normalize(path)

        if (files.delete(target)) {
          return Effect.void
        }

        if (directories.has(target)) {
          const prefix = `${target}/`
          const hasEntries =
            [...files.keys()].some((file) => file.startsWith(prefix)) ||
            [...directories].some((directory) => directory.startsWith(prefix))

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
    stream: () => Stream.die(makeUnimplementedError("stream")),
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
    makeReadOnly: (path) => {
      readOnlyPaths.add(normalize(path))
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
