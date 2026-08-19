import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"
import * as Result from "effect/Result"
import { FastCheck } from "effect/testing"
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

  const nodeLine = FastCheck.tuple(
    FastCheck.constantFrom("", "  ", "\t"),
    FastCheck.constantFrom("node", "nodejs"),
    FastCheck.constantFrom(" ", "  ", "\t"),
    FastCheck.constantFrom("22.19.0", "22", "lts/iron"),
    FastCheck.constantFrom("", "  ", " # pinned")
  ).map((parts) => parts.join(""))
  // Lines the parser must ignore: comments, other tools, node-prefixed tool names, and bare
  // `node` entries without a version.
  const inertLine = FastCheck.constantFrom(
    "",
    "# pinned tools",
    "  # node 22.19.0",
    "python 3.12.0",
    "ruby 3.3.0  # main",
    "node",
    "nodejs",
    "node-canvas 1.0.0",
    "gonode 1.0.0"
  )

  it.effect.prop(
    "detect a .tool-versions node entry regardless of surrounding noise",
    {
      hasNode: FastCheck.boolean(),
      lines: FastCheck.array(inertLine, { maxLength: 8 }),
      node: nodeLine,
      position: FastCheck.nat({ max: 8 }),
    },
    ({ hasNode, lines, node, position }) =>
      Effect.gen(function* () {
        const allLines: string[] = [...lines]
        if (hasNode) {
          allLines.splice(Math.min(position, allLines.length), 0, node)
        }
        const files = makeFiles({ ".tool-versions": allLines.join("\n") })

        const source = yield* runResolve(files)

        expect(source).toEqual(
          hasNode ? { _tag: "File", path: ".tool-versions" } : { _tag: "Version", value: "lts/*" }
        )
      }),
    { fastCheck: { numRuns: 200 } }
  )

  const versionFileContent = FastCheck.constantFrom(
    { content: "22.19.0\n", valid: true },
    { content: "22\n", valid: true },
    { content: "", valid: false },
    { content: "   \n", valid: false }
  )
  const toolVersionsContent = FastCheck.constantFrom(
    { content: "nodejs 22.19.0\n", valid: true },
    { content: "node 22\n", valid: true },
    { content: "python 3.12.0\n", valid: false },
    { content: "# only comments\n", valid: false }
  )
  const packageJsonContent = FastCheck.constantFrom(
    { content: JSON.stringify({ engines: { node: ">=22" }, name: "pkg" }), valid: true },
    { content: JSON.stringify({ name: "pkg", volta: { node: "22.19.0" } }), valid: true },
    {
      content: JSON.stringify({
        devEngines: { runtime: { name: "node", version: "22" } },
        name: "pkg",
      }),
      valid: true,
    },
    { content: JSON.stringify({ name: "pkg" }), valid: false }
  )

  it.effect.prop(
    "resolve the highest-precedence valid declaration for any file combination",
    {
      nodeVersion: FastCheck.option(versionFileContent),
      nvmrc: FastCheck.option(versionFileContent),
      packageJson: FastCheck.option(packageJsonContent),
      toolVersions: FastCheck.option(toolVersionsContent),
    },
    ({ nodeVersion, nvmrc, packageJson, toolVersions }) =>
      Effect.gen(function* () {
        const fixtures: Record<string, string> = {}
        if (nodeVersion) {
          fixtures[".node-version"] = nodeVersion.content
        }
        if (nvmrc) {
          fixtures[".nvmrc"] = nvmrc.content
        }
        if (toolVersions) {
          fixtures[".tool-versions"] = toolVersions.content
        }
        if (packageJson) {
          fixtures["package.json"] = packageJson.content
        }
        const files = makeFiles(fixtures)

        const source = yield* runResolve(files)

        const expected = nodeVersion?.valid
          ? { _tag: "File", path: ".node-version" }
          : nvmrc?.valid
            ? { _tag: "File", path: ".nvmrc" }
            : toolVersions?.valid
              ? { _tag: "File", path: ".tool-versions" }
              : packageJson?.valid
                ? { _tag: "File", path: "package.json" }
                : { _tag: "Version", value: "lts/*" }
        expect(source).toEqual(expected)
      }),
    { fastCheck: { numRuns: 200 } }
  )

  const nonEmptyVersion = FastCheck.constantFrom("22.19.0", ">=22", "lts/*")
  const declaringManifest = FastCheck.oneof(
    nonEmptyVersion.map((node) => ({ volta: { node } })),
    nonEmptyVersion.map((node) => ({ engines: { node } })),
    FastCheck.tuple(FastCheck.constantFrom("node", "Node", "NODE"), nonEmptyVersion).map(
      ([name, version]) => ({ devEngines: { runtime: { name, version } } })
    ),
    nonEmptyVersion.map((version) => ({
      devEngines: {
        runtime: [
          { name: "deno", version: "2.0.0" },
          { name: "node", version },
        ],
      },
    }))
  )
  const nonDeclaringManifest = FastCheck.constantFrom(
    {},
    { engines: {} },
    { engines: { node: "" } },
    { volta: {} },
    { volta: { node: "" } },
    { devEngines: {} },
    { devEngines: { runtime: { name: "bun", version: "1.2.0" } } },
    { devEngines: { runtime: { name: "node" } } },
    { devEngines: { runtime: [{ name: "deno", version: "2.0.0" }] } }
  )

  it.effect.prop(
    "recognize every supported package.json declaration shape",
    { manifest: declaringManifest },
    ({ manifest }) =>
      Effect.gen(function* () {
        const files = makeFiles({ "package.json": JSON.stringify({ name: "pkg", ...manifest }) })

        const source = yield* runResolve(files)

        expect(source).toEqual({ _tag: "File", path: "package.json" })
      }),
    { fastCheck: { numRuns: 200 } }
  )

  it.effect.prop(
    "fall back to lts/* when package.json declares nothing",
    { manifest: nonDeclaringManifest },
    ({ manifest }) =>
      Effect.gen(function* () {
        const files = makeFiles({ "package.json": JSON.stringify({ name: "pkg", ...manifest }) })

        const source = yield* runResolve(files)

        expect(source).toEqual({ _tag: "Version", value: "lts/*" })
      }),
    { fastCheck: { numRuns: 100 } }
  )

  it.effect.prop(
    "resolve without failing for arbitrary package.json JSON",
    { value: FastCheck.jsonValue({ maxDepth: 3 }) },
    ({ value }) =>
      Effect.gen(function* () {
        const files = makeFiles({ "package.json": JSON.stringify(value) })

        const source = yield* runResolve(files)

        expect(["File", "Version"]).toContain(source._tag)
      }),
    { fastCheck: { numRuns: 200 } }
  )
})
