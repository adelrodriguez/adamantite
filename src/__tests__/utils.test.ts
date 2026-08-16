import type { PackageJson } from "type-fest"

import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"
import * as Terminal from "effect/Terminal"
import { writeFile } from "#__tests__/filesystem.ts"
import { runResult } from "#__tests__/helpers.ts"
import { mergeConfig, parseJson, serializeTsObjectLiteral } from "#lib/shared/json.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"
import { normalizeDependencyVersion, readPackageJson } from "#lib/workspace/package-json.ts"
import { printTitle } from "#terminal/title.ts"

const NodeContext = NodeServices
const noop = () => null

let testDir: string
let originalCwd: string

function makeTerminalLayer(columns?: number) {
  return Layer.succeed(Terminal.Terminal)(
    Terminal.make({
      // SAFETY: Node reports undefined columns when stdout is not a TTY despite the Terminal interface promising a number, and printTitle guards the missing width with a falsy check.
      columns: Effect.succeed<number | undefined>(columns) as Effect.Effect<number>,
      display: () => Effect.void,
      readInput: Effect.never,
      readLine: Effect.never,
      rows: Effect.succeed(24),
    })
  )
}

beforeEach(() => {
  testDir = join(tmpdir(), `adamantite-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(testDir, { recursive: true })
  originalCwd = process.cwd()
  process.chdir(testDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(testDir, { force: true, recursive: true })
})

describe("readPackageJson", () => {
  describe("when a path is provided", () => {
    it.effect("read and parse a valid package.json", () =>
      Effect.gen(function* () {
        const packageJson: PackageJson = {
          dependencies: {
            react: "^18.0.0",
          },
          devDependencies: {
            typescript: "^5.0.0",
          },
          name: "test-package",
          version: "1.0.0",
        }
        yield* Effect.promise(() =>
          writeFile(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))
        )

        const result = yield* readPackageJson(testDir).pipe(Effect.provide(NodeContext.layer))

        expect(result).toEqual(packageJson)
      })
    )

    it.effect("return an error when package.json does not exist", () =>
      Effect.gen(function* () {
        const result = yield* runResult(readPackageJson(testDir), NodeServices.layer)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
        }
      })
    )

    it.effect("return an error when package.json contains invalid JSON", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(join(testDir, "package.json"), "invalid json content")
        )

        const result = yield* runResult(readPackageJson(testDir), NodeServices.layer)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToParseFile" })
        }
      })
    )
  })

  describe("when cwd is omitted", () => {
    it.effect("use the current working directory by default", () =>
      Effect.gen(function* () {
        const packageJson: PackageJson = {
          name: "test-package",
          version: "1.0.0",
        }
        yield* Effect.promise(() =>
          writeFile(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))
        )

        const result = yield* readPackageJson().pipe(Effect.provide(NodeContext.layer))

        expect(result).toEqual(packageJson)
      })
    )

    it.effect("respect the explicit cwd argument", () =>
      Effect.gen(function* () {
        const fileSystemLayer = FileSystem.layerNoop({
          readFileString: () =>
            Effect.succeed(
              JSON.stringify({
                name: "test-project",
                version: "1.0.0",
              })
            ),
        })

        const result = yield* readPackageJson("/test/project").pipe(
          Effect.provide(fileSystemLayer),
          Effect.provide(NodeServices.layer)
        )

        expect(result.name).toBe("test-project")
        expect(result.version).toBe("1.0.0")
      })
    )
  })
})

describe("parseJson", () => {
  it.effect("parse valid JSON", () =>
    Effect.gen(function* () {
      const validJson = '{"name": "test", "version": "1.0.0"}'
      const result = yield* parseJson(validJson).pipe(Effect.provide(NodeContext.layer))

      expect(result).toEqual({
        name: "test",
        version: "1.0.0",
      })
    })
  )

  it.effect("parse valid JSONC with comments", () =>
    Effect.gen(function* () {
      const jsonc = `{
      // This is a comment
      "name": "test",
      "version": "1.0.0"
    }`
      const result = yield* parseJson(jsonc).pipe(Effect.provide(NodeContext.layer))

      expect(result).toEqual({
        name: "test",
        version: "1.0.0",
      })
    })
  )

  it.effect("parse JSON with trailing commas", () =>
    Effect.gen(function* () {
      const jsonWithTrailingComma = '{"name": "test", "version": "1.0.0",}'
      const result = yield* parseJson(jsonWithTrailingComma).pipe(Effect.provide(NodeContext.layer))

      expect(result).toEqual({
        name: "test",
        version: "1.0.0",
      })
    })
  )

  it.effect("return an error for invalid JSON", () =>
    Effect.gen(function* () {
      const invalidJson = '{"name": "test", "version":}'
      const result = yield* runResult(parseJson(invalidJson), NodeServices.layer)
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToParseFile" })
      }
    })
  )

  it.effect("return an error for an empty string", () =>
    Effect.gen(function* () {
      const result = yield* runResult(parseJson(""), NodeServices.layer)
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToParseFile" })
      }
    })
  )
})

describe("mergeConfig", () => {
  it.effect("merge two objects", () =>
    Effect.gen(function* () {
      const base = { a: 1, b: 2 }
      const override = { b: 3, c: 4 }
      const result = yield* mergeConfig(base, override).pipe(Effect.provide(NodeContext.layer))

      expect(result).toEqual({ a: 1, b: 2, c: 4 })
    })
  )

  it.effect("give priority to the first argument", () =>
    Effect.gen(function* () {
      const first = { a: 1, b: 2 }
      const second = { a: 3, b: 4 }
      const result = yield* mergeConfig(first, second).pipe(Effect.provide(NodeContext.layer))

      expect(result).toEqual({ a: 1, b: 2 })
    })
  )

  it.effect("handle nested objects", () =>
    Effect.gen(function* () {
      const base = { a: { x: 1, y: 2 }, b: 3 }
      const override = { a: { y: 4, z: 5 }, b: 6 }
      const result = yield* mergeConfig(base, override).pipe(Effect.provide(NodeContext.layer))

      expect(result).toEqual({ a: { x: 1, y: 2, z: 5 }, b: 3 })
    })
  )

  it.effect("return an error when defu throws", () =>
    Effect.gen(function* () {
      const throwingBase = new Proxy(
        {},
        {
          get() {
            throw new Error("Simulated defu error")
          },
          ownKeys() {
            throw new Error("Simulated defu error")
          },
        }
      )

      const result = yield* runResult(mergeConfig(throwingBase, { b: 2 }), NodeServices.layer)
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToMergeConfig" })
      }
    })
  )
})

describe("serializeTsObjectLiteral", () => {
  it("serialize objects as TypeScript object literals", () => {
    const result = serializeTsObjectLiteral({
      enabled: true,
      nested: {
        count: 2,
      },
    })

    expect(result).toBe(`{
  enabled: true,
  nested: {
    count: 2
  }
}`)
  })

  it("keep non-identifier keys quoted", () => {
    const result = serializeTsObjectLiteral({
      "foo-bar": true,
      validKey: false,
    })

    expect(result).toBe(`{
  "foo-bar": true,
  validKey: false
}`)
  })

  it("indent continuation lines when embedding multiline values", () => {
    const result = serializeTsObjectLiteral(
      {
        nested: {
          flag: true,
        },
      },
      { continuationIndent: "  " }
    )

    expect(result).toBe(`{
    nested: {
      flag: true
    }
  }`)
  })

  it("support custom indentation strings", () => {
    const result = serializeTsObjectLiteral(
      {
        nested: {
          flag: true,
        },
      },
      { indentation: "    " }
    )

    expect(result).toBe(`{
    nested: {
        flag: true
    }
}`)
  })
})

describe("checkIsMonorepo", () => {
  describe("when cwd is explicit", () => {
    it.effect("respect the explicit cwd argument", () =>
      Effect.gen(function* () {
        const fileSystemLayer = FileSystem.layerNoop({
          exists: () => Effect.succeed(false),
          readFileString: () =>
            Effect.succeed(
              JSON.stringify({
                name: "test-project",
                version: "1.0.0",
                workspaces: ["packages/*"],
              })
            ),
        })

        const result = yield* checkIsMonorepo("/test/project").pipe(
          Effect.provide(fileSystemLayer),
          Effect.provide(NodeServices.layer)
        )

        expect(result).toBe(true)
      })
    )
  })

  describe("when workspace files are present", () => {
    it.effect("return true when pnpm-workspace.yaml exists", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(join(testDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'")
        )

        const result = yield* checkIsMonorepo(testDir).pipe(Effect.provide(NodeContext.layer))

        expect(result).toBe(true)
      })
    )

    it.effect("return true when package.json has a workspaces field", () =>
      Effect.gen(function* () {
        const packageJson: PackageJson = {
          name: "test-package",
          workspaces: ["packages/*"],
        }
        yield* Effect.promise(() =>
          writeFile(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))
        )

        const result = yield* checkIsMonorepo(testDir).pipe(Effect.provide(NodeContext.layer))

        expect(result).toBe(true)
      })
    )
  })

  describe("when workspace files are absent", () => {
    it.effect("return false when neither condition is met", () =>
      Effect.gen(function* () {
        const packageJson: PackageJson = {
          name: "test-package",
          version: "1.0.0",
        }
        yield* Effect.promise(() =>
          writeFile(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))
        )

        const result = yield* checkIsMonorepo(testDir).pipe(Effect.provide(NodeContext.layer))

        expect(result).toBe(false)
      })
    )

    it.effect("return an error when package.json does not exist", () =>
      Effect.gen(function* () {
        const result = yield* runResult(checkIsMonorepo(testDir), NodeServices.layer)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
        }
      })
    )
  })
})

describe("printTitle", () => {
  let capturedLogs: string[]

  beforeEach(() => {
    capturedLogs = []
  })

  function makeConsoleLayer() {
    const mockConsole: Console.Console = {
      assert: noop,
      clear: noop,
      count: noop,
      countReset: noop,
      debug: noop,
      dir: noop,
      dirxml: noop,
      error: noop,
      group: noop,
      groupCollapsed: noop,
      groupEnd: noop,
      info: (...args: unknown[]) => {
        const message = args.map(String).join(" ")
        capturedLogs.push(message)
        return null
      },
      log: noop,
      table: noop,
      time: noop,
      timeEnd: noop,
      timeLog: noop,
      trace: noop,
      warn: noop,
    }

    return Layer.succeed(Console.Console)(mockConsole)
  }

  it.effect("print the title when the terminal is wide enough", () =>
    Effect.gen(function* () {
      const testLayer = Layer.merge(makeTerminalLayer(120), makeConsoleLayer())
      yield* printTitle().pipe(Effect.provide(testLayer))

      expect(capturedLogs.length).toBe(1)
      expect(capturedLogs[0]).toContain(".ooooo.")
    })
  )

  it.effect("not print the title when the terminal is too narrow", () =>
    Effect.gen(function* () {
      const testLayer = Layer.mergeAll(NodeContext.layer, makeTerminalLayer(50), makeConsoleLayer())
      yield* printTitle().pipe(Effect.provide(testLayer))

      expect(capturedLogs.length).toBe(0)
    })
  )

  it.effect("not print the title when process.stdout.columns is undefined", () =>
    Effect.gen(function* () {
      const testLayer = Layer.mergeAll(NodeContext.layer, makeTerminalLayer(), makeConsoleLayer())
      yield* printTitle().pipe(Effect.provide(testLayer))

      expect(capturedLogs.length).toBe(0)
    })
  )
})

describe("normalizeDependencyVersion", () => {
  it("strip caret and tilde prefixes", () => {
    expect(normalizeDependencyVersion("^0.20.0")).toBe("0.20.0")
    expect(normalizeDependencyVersion("~0.20.0")).toBe("0.20.0")
  })

  it("preserve exact versions", () => {
    expect(normalizeDependencyVersion("0.20.0")).toBe("0.20.0")
  })

  it("trim whitespace and strip the workspace prefix", () => {
    expect(normalizeDependencyVersion("  workspace:^0.20.0  ")).toBe("0.20.0")
  })
})
