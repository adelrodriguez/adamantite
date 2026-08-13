import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"
import { runResult } from "#__tests__/helpers.ts"
import { NodeVersionResolver } from "#lib/services/node-version-resolver.ts"

const testLayer = NodeVersionResolver.layer.pipe(Layer.provide(NodeServices.layer))

function resolve(cwd: string) {
  return Effect.gen(function* () {
    const resolver = yield* NodeVersionResolver
    return yield* resolver.resolve(cwd)
  })
}

function runResolve(cwd: string) {
  return resolve(cwd).pipe(Effect.provide(testLayer), Effect.runPromise)
}

describe("NodeVersionResolver", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-node-version-resolver-test-"))
  })

  afterEach(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  test("select .node-version when it contains a version", async () => {
    await Bun.write(join(tempDir, ".node-version"), "22.19.0\n")

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "File", path: ".node-version" })
  })

  test("select .nvmrc when .node-version is absent", async () => {
    await Bun.write(join(tempDir, ".nvmrc"), "22\n")

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "File", path: ".nvmrc" })
  })

  test("select .node-version when several valid declarations exist", async () => {
    await Bun.write(join(tempDir, ".node-version"), "22.19.0\n")
    await Bun.write(join(tempDir, ".nvmrc"), "20\n")
    await Bun.write(join(tempDir, ".tool-versions"), "nodejs 22.19.0\n")
    await Bun.write(
      join(tempDir, "package.json"),
      JSON.stringify({ engines: { node: ">=22.19.0" }, name: "test-project" })
    )

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "File", path: ".node-version" })
  })

  test("fall through an empty .node-version to the next valid source", async () => {
    await Bun.write(join(tempDir, ".node-version"), "\n")
    await Bun.write(join(tempDir, ".nvmrc"), "22\n")

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "File", path: ".nvmrc" })
  })

  test("select .tool-versions when it declares nodejs", async () => {
    await Bun.write(join(tempDir, ".tool-versions"), "ruby 3.3.0\nnodejs 22.19.0\n")

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "File", path: ".tool-versions" })
  })

  test("select .tool-versions when it declares node with the mise spelling", async () => {
    await Bun.write(join(tempDir, ".tool-versions"), "node 22.19.0\n")

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "File", path: ".tool-versions" })
  })

  test("ignore .tool-versions without a nodejs entry", async () => {
    await Bun.write(join(tempDir, ".tool-versions"), "ruby 3.3.0\n# nodejs 22.19.0\n")

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "Version", value: "lts/*" })
  })

  test("select package.json for volta.node", async () => {
    await Bun.write(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "test-project", volta: { node: "22.19.0" } })
    )

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "File", path: "package.json" })
  })

  test("select package.json for a node entry in a devEngines.runtime object", async () => {
    await Bun.write(
      join(tempDir, "package.json"),
      JSON.stringify({
        devEngines: { runtime: { name: "node", version: "22.19.0" } },
        name: "test-project",
      })
    )

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "File", path: "package.json" })
  })

  test("select package.json for a devEngines.runtime entry with a differently cased name", async () => {
    await Bun.write(
      join(tempDir, "package.json"),
      JSON.stringify({
        devEngines: { runtime: { name: "Node", version: "22.19.0" } },
        name: "test-project",
      })
    )

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "File", path: "package.json" })
  })

  test("select package.json for a node entry in a devEngines.runtime array", async () => {
    await Bun.write(
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

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "File", path: "package.json" })
  })

  test("select package.json for engines.node", async () => {
    await Bun.write(
      join(tempDir, "package.json"),
      JSON.stringify({ engines: { node: ">=22.19.0" }, name: "test-project" })
    )

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "File", path: "package.json" })
  })

  test("ignore package.json without a Node.js declaration", async () => {
    await Bun.write(
      join(tempDir, "package.json"),
      JSON.stringify({ engines: { bun: ">=1.0.0" }, name: "test-project" })
    )

    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "Version", value: "lts/*" })
  })

  test("fall back to lts/* when no declaration exists", async () => {
    const source = await runResolve(tempDir)

    expect(source).toEqual({ _tag: "Version", value: "lts/*" })
  })

  test("return FailedToReadFile for an unreadable .node-version", async () => {
    await Bun.write(join(tempDir, ".node-version"), "22.19.0\n")
    chmodSync(join(tempDir, ".node-version"), 0o000)

    const result = await runResult(resolve(tempDir), testLayer)

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
    }
  })

  test("return FailedToParseFile for a malformed package.json", async () => {
    await Bun.write(join(tempDir, "package.json"), "{ not json")

    const result = await runResult(resolve(tempDir), testLayer)

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({ _tag: "FailedToParseFile" })
    }
  })
})
