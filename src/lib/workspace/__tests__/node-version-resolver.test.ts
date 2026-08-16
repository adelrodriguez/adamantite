import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function makeTestLayer(fileSystemLayer: Layer.Layer<FileSystem.FileSystem>) {
  return NodeVersionResolver.layer.pipe(Layer.provide(Layer.mergeAll(fileSystemLayer, Path.layer)))
}

function resolve(cwd: string) {
  return Effect.gen(function* () {
    const resolver = yield* NodeVersionResolver
    return yield* resolver.resolve(cwd)
  })
}

function runResolve(files: FileSystemTestContext) {
  return resolve(ROOT).pipe(Effect.provide(makeTestLayer(files.layer)))
}

describe("NodeVersionResolver", () => {
  it.effect("select .node-version when it contains a version", () =>
    Effect.gen(function* () {
      const files = makeFiles({ ".node-version": "22.19.0\n" })

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "File", path: ".node-version" })
    })
  )

  it.effect("select .nvmrc when .node-version is absent", () =>
    Effect.gen(function* () {
      const files = makeFiles({ ".nvmrc": "22\n" })

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "File", path: ".nvmrc" })
    })
  )

  it.effect("select .node-version when several valid declarations exist", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".node-version": "22.19.0\n",
        ".nvmrc": "20\n",
        ".tool-versions": "nodejs 22.19.0\n",
        "package.json": JSON.stringify({ engines: { node: ">=22.19.0" }, name: "test-project" }),
      })

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "File", path: ".node-version" })
    })
  )

  it.effect("fall through an empty .node-version to the next valid source", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".node-version": "\n",
        ".nvmrc": "22\n",
      })

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "File", path: ".nvmrc" })
    })
  )

  it.effect("select .tool-versions when it declares nodejs", () =>
    Effect.gen(function* () {
      const files = makeFiles({ ".tool-versions": "ruby 3.3.0\nnodejs 22.19.0\n" })

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "File", path: ".tool-versions" })
    })
  )

  it.effect("select .tool-versions when it declares node with the mise spelling", () =>
    Effect.gen(function* () {
      const files = makeFiles({ ".tool-versions": "node 22.19.0\n" })

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "File", path: ".tool-versions" })
    })
  )

  it.effect("ignore .tool-versions without a nodejs entry", () =>
    Effect.gen(function* () {
      const files = makeFiles({ ".tool-versions": "ruby 3.3.0\n# nodejs 22.19.0\n" })

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "Version", value: "lts/*" })
    })
  )

  it.effect("select package.json for volta.node", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "package.json": JSON.stringify({ name: "test-project", volta: { node: "22.19.0" } }),
      })

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "File", path: "package.json" })
    })
  )

  it.effect("select package.json for a node entry in a devEngines.runtime object", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "package.json": JSON.stringify({
          devEngines: { runtime: { name: "node", version: "22.19.0" } },
          name: "test-project",
        }),
      })

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "File", path: "package.json" })
    })
  )

  it.effect(
    "select package.json for a devEngines.runtime entry with a differently cased name",
    () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify({
            devEngines: { runtime: { name: "Node", version: "22.19.0" } },
            name: "test-project",
          }),
        })

        const source = yield* runResolve(files)

        expect(source).toEqual({ _tag: "File", path: "package.json" })
      })
  )

  it.effect("select package.json for a node entry in a devEngines.runtime array", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "package.json": JSON.stringify({
          devEngines: {
            runtime: [
              { name: "bun", version: "1.0.0" },
              { name: "node", version: "22.19.0" },
            ],
          },
          name: "test-project",
        }),
      })

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "File", path: "package.json" })
    })
  )

  it.effect("select package.json for engines.node", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "package.json": JSON.stringify({ engines: { node: ">=22.19.0" }, name: "test-project" }),
      })

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "File", path: "package.json" })
    })
  )

  it.effect("ignore package.json without a Node.js declaration", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "package.json": JSON.stringify({ engines: { bun: ">=1.0.0" }, name: "test-project" }),
      })

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "Version", value: "lts/*" })
    })
  )

  it.effect("fall back to lts/* when no declaration exists", () =>
    Effect.gen(function* () {
      const files = makeFiles()

      const source = yield* runResolve(files)

      expect(source).toEqual({ _tag: "Version", value: "lts/*" })
    })
  )

  it.effect("return FailedToReadFile for an unreadable .node-version", () =>
    Effect.gen(function* () {
      // The in-memory filesystem cannot make reads fail with permissions, so an
      // explicit layer reports the file as existing but unreadable (chmod 0o000).
      const cause = PlatformError.systemError({
        _tag: "PermissionDenied",
        method: "readFileString",
        module: "FileSystem",
        pathOrDescriptor: `${ROOT}/.node-version`,
      })
      const fileSystemLayer = FileSystem.layerNoop({
        exists: () => Effect.succeed(true),
        readFileString: () => Effect.fail(cause),
      })

      const result = yield* Effect.result(
        resolve(ROOT).pipe(Effect.provide(makeTestLayer(fileSystemLayer)))
      )

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })
  )

  it.effect("return FailedToParseFile for a malformed package.json", () =>
    Effect.gen(function* () {
      const files = makeFiles({ "package.json": "{ not json" })

      const result = yield* Effect.result(runResolve(files))

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToParseFile" })
      }
    })
  )
})
