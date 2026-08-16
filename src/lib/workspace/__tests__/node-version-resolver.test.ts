import { chmodSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"
import { writeFile } from "#__tests__/filesystem.ts"
import { runResult } from "#__tests__/helpers.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"

const testLayer = NodeVersionResolver.layer.pipe(Layer.provide(NodeServices.layer))

function resolve(cwd: string) {
  return Effect.gen(function* () {
    const resolver = yield* NodeVersionResolver
    return yield* resolver.resolve(cwd)
  })
}

function runResolve(cwd: string) {
  return resolve(cwd).pipe(Effect.provide(testLayer))
}

describe("NodeVersionResolver", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-node-version-resolver-test-"))
  })

  afterEach(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  it.effect("select .node-version when it contains a version", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile(join(tempDir, ".node-version"), "22.19.0\n"))

      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "File", path: ".node-version" })
    })
  )

  it.effect("select .nvmrc when .node-version is absent", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile(join(tempDir, ".nvmrc"), "22\n"))

      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "File", path: ".nvmrc" })
    })
  )

  it.effect("select .node-version when several valid declarations exist", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile(join(tempDir, ".node-version"), "22.19.0\n"))
      yield* Effect.promise(() => writeFile(join(tempDir, ".nvmrc"), "20\n"))
      yield* Effect.promise(() => writeFile(join(tempDir, ".tool-versions"), "nodejs 22.19.0\n"))
      yield* Effect.promise(() =>
        writeFile(
          join(tempDir, "package.json"),
          JSON.stringify({ engines: { node: ">=22.19.0" }, name: "test-project" })
        )
      )

      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "File", path: ".node-version" })
    })
  )

  it.effect("fall through an empty .node-version to the next valid source", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile(join(tempDir, ".node-version"), "\n"))
      yield* Effect.promise(() => writeFile(join(tempDir, ".nvmrc"), "22\n"))

      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "File", path: ".nvmrc" })
    })
  )

  it.effect("select .tool-versions when it declares nodejs", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(join(tempDir, ".tool-versions"), "ruby 3.3.0\nnodejs 22.19.0\n")
      )

      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "File", path: ".tool-versions" })
    })
  )

  it.effect("select .tool-versions when it declares node with the mise spelling", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile(join(tempDir, ".tool-versions"), "node 22.19.0\n"))

      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "File", path: ".tool-versions" })
    })
  )

  it.effect("ignore .tool-versions without a nodejs entry", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(join(tempDir, ".tool-versions"), "ruby 3.3.0\n# nodejs 22.19.0\n")
      )

      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "Version", value: "lts/*" })
    })
  )

  it.effect("select package.json for volta.node", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(
          join(tempDir, "package.json"),
          JSON.stringify({ name: "test-project", volta: { node: "22.19.0" } })
        )
      )

      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "File", path: "package.json" })
    })
  )

  it.effect("select package.json for a node entry in a devEngines.runtime object", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(
          join(tempDir, "package.json"),
          JSON.stringify({
            devEngines: { runtime: { name: "node", version: "22.19.0" } },
            name: "test-project",
          })
        )
      )

      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "File", path: "package.json" })
    })
  )

  it.effect(
    "select package.json for a devEngines.runtime entry with a differently cased name",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, "package.json"),
            JSON.stringify({
              devEngines: { runtime: { name: "Node", version: "22.19.0" } },
              name: "test-project",
            })
          )
        )

        const source = yield* runResolve(tempDir)

        expect(source).toEqual({ _tag: "File", path: "package.json" })
      })
  )

  it.effect("select package.json for a node entry in a devEngines.runtime array", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(
          join(tempDir, "package.json"),
          JSON.stringify({
            devEngines: {
              runtime: [
                { name: "bun", version: "1.0.0" },
                { name: "node", version: "22.19.0" },
              ],
            },
            name: "test-project",
          })
        )
      )

      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "File", path: "package.json" })
    })
  )

  it.effect("select package.json for engines.node", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(
          join(tempDir, "package.json"),
          JSON.stringify({ engines: { node: ">=22.19.0" }, name: "test-project" })
        )
      )

      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "File", path: "package.json" })
    })
  )

  it.effect("ignore package.json without a Node.js declaration", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(
          join(tempDir, "package.json"),
          JSON.stringify({ engines: { bun: ">=1.0.0" }, name: "test-project" })
        )
      )

      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "Version", value: "lts/*" })
    })
  )

  it.effect("fall back to lts/* when no declaration exists", () =>
    Effect.gen(function* () {
      const source = yield* runResolve(tempDir)

      expect(source).toEqual({ _tag: "Version", value: "lts/*" })
    })
  )

  it.effect("return FailedToReadFile for an unreadable .node-version", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile(join(tempDir, ".node-version"), "22.19.0\n"))
      chmodSync(join(tempDir, ".node-version"), 0o000)

      const result = yield* runResult(resolve(tempDir), testLayer)

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })
  )

  it.effect("return FailedToParseFile for a malformed package.json", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile(join(tempDir, "package.json"), "{ not json"))

      const result = yield* runResult(resolve(tempDir), testLayer)

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToParseFile" })
      }
    })
  )
})
