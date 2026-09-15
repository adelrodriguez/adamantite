import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
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

  const nodeLine = Schema.TemplateLiteral([
    Schema.Literals(["", "  ", "\t"]),
    Schema.Literals(["node", "nodejs"]),
    Schema.Literals([" ", "  ", "\t"]),
    Schema.Literals(["22.19.0", "22", "lts/iron"]),
    Schema.Literals(["", "  ", " # pinned"]),
  ])
  // Lines the parser must ignore: comments, other tools, node-prefixed tool names, and bare
  // `node` entries without a version. The `node # pinned` shapes stay inert only when comments
  // are stripped before matching, so they keep the comment handling load-bearing.
  const inertLine = Schema.Literals([
    "",
    "# pinned tools",
    "  # node 22.19.0",
    "node # pinned",
    "nodejs\t# 22.19.0",
    "python 3.12.0",
    "ruby 3.3.0  # main",
    "node",
    "nodejs",
    "node-canvas 1.0.0",
    "gonode 1.0.0",
  ])

  it.effect.prop(
    "detect a .tool-versions node entry regardless of surrounding noise",
    {
      hasNode: Schema.Boolean,
      lines: Schema.mutable(Schema.Array(inertLine).check(Schema.isMaxLength(8))),
      node: nodeLine,
      position: Schema.Int.check(Schema.isBetween({ maximum: 8, minimum: 0 })),
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
    { arbitrary: { runs: 200 } }
  )

  const versionFileContent = Schema.Union([
    Schema.Struct({ content: Schema.Literal("22.19.0\n"), valid: Schema.Literal(true) }),
    Schema.Struct({ content: Schema.Literal("22\n"), valid: Schema.Literal(true) }),
    Schema.Struct({ content: Schema.Literal(""), valid: Schema.Literal(false) }),
    Schema.Struct({ content: Schema.Literal("   \n"), valid: Schema.Literal(false) }),
  ])
  const toolVersionsContent = Schema.Union([
    Schema.Struct({ content: Schema.Literal("nodejs 22.19.0\n"), valid: Schema.Literal(true) }),
    Schema.Struct({ content: Schema.Literal("node 22\n"), valid: Schema.Literal(true) }),
    Schema.Struct({ content: Schema.Literal("python 3.12.0\n"), valid: Schema.Literal(false) }),
    Schema.Struct({ content: Schema.Literal("# only comments\n"), valid: Schema.Literal(false) }),
  ])
  const packageJsonContent = Schema.Union([
    Schema.Struct({
      content: Schema.Literal(JSON.stringify({ engines: { node: ">=22" }, name: "pkg" })),
      valid: Schema.Literal(true),
    }),
    Schema.Struct({
      content: Schema.Literal(JSON.stringify({ name: "pkg", volta: { node: "22.19.0" } })),
      valid: Schema.Literal(true),
    }),
    Schema.Struct({
      content: Schema.Literal(
        JSON.stringify({
          devEngines: { runtime: { name: "node", version: "22" } },
          name: "pkg",
        })
      ),
      valid: Schema.Literal(true),
    }),
    Schema.Struct({
      content: Schema.Literal(JSON.stringify({ name: "pkg" })),
      valid: Schema.Literal(false),
    }),
  ])

  it.effect.prop(
    "resolve the highest-precedence valid declaration for any file combination",
    {
      nodeVersion: Schema.Union([...versionFileContent.members, Schema.Null]),
      nvmrc: Schema.Union([...versionFileContent.members, Schema.Null]),
      packageJson: Schema.Union([...packageJsonContent.members, Schema.Null]),
      toolVersions: Schema.Union([...toolVersionsContent.members, Schema.Null]),
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
    { arbitrary: { runs: 200 } }
  )

  const nonEmptyVersion = Schema.Literals(["22.19.0", ">=22", "lts/*"])
  const declaringManifest = Schema.Union([
    Schema.Struct({ volta: Schema.Struct({ node: nonEmptyVersion }) }),
    Schema.Struct({ engines: Schema.Struct({ node: nonEmptyVersion }) }),
    Schema.Struct({
      devEngines: Schema.Struct({
        runtime: Schema.Struct({
          name: Schema.Literals(["node", "Node", "NODE"]),
          version: nonEmptyVersion,
        }),
      }),
    }),
    Schema.Struct({
      devEngines: Schema.Struct({
        runtime: Schema.Tuple([
          Schema.Struct({ name: Schema.Literal("deno"), version: Schema.Literal("2.0.0") }),
          Schema.Struct({ name: Schema.Literal("node"), version: nonEmptyVersion }),
        ]),
      }),
    }),
  ])
  const nonDeclaringManifest = Schema.Union([
    Schema.Struct({}),
    Schema.Struct({ engines: Schema.Struct({}) }),
    Schema.Struct({ engines: Schema.Struct({ node: Schema.Literal("") }) }),
    Schema.Struct({ volta: Schema.Struct({}) }),
    Schema.Struct({ volta: Schema.Struct({ node: Schema.Literal("") }) }),
    Schema.Struct({ devEngines: Schema.Struct({}) }),
    Schema.Struct({
      devEngines: Schema.Struct({
        runtime: Schema.Struct({ name: Schema.Literal("bun"), version: Schema.Literal("1.2.0") }),
      }),
    }),
    Schema.Struct({
      devEngines: Schema.Struct({ runtime: Schema.Struct({ name: Schema.Literal("node") }) }),
    }),
    Schema.Struct({
      devEngines: Schema.Struct({
        runtime: Schema.mutable(
          Schema.Tuple([
            Schema.Struct({ name: Schema.Literal("deno"), version: Schema.Literal("2.0.0") }),
          ])
        ),
      }),
    }),
  ])

  it.effect.prop(
    "recognize every supported package.json declaration shape",
    { manifest: declaringManifest },
    ({ manifest }) =>
      Effect.gen(function* () {
        const files = makeFiles({ "package.json": JSON.stringify({ name: "pkg", ...manifest }) })

        const source = yield* runResolve(files)

        expect(source).toEqual({ _tag: "File", path: "package.json" })
      }),
    { arbitrary: { runs: 200 } }
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
    { arbitrary: { runs: 100 } }
  )

  it.effect.prop(
    "resolve without failing for arbitrary package.json JSON",
    { value: Schema.MutableJson },
    ({ value }) =>
      Effect.gen(function* () {
        const files = makeFiles({ "package.json": JSON.stringify(value) })

        const source = yield* runResolve(files)

        expect(["File", "Version"]).toContain(source._tag)
      }),
    { arbitrary: { runs: 200 } }
  )
})
