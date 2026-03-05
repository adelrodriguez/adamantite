import type { PackageJson } from "type-fest"

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Terminal } from "@effect/platform"
import * as NodeContext from "@effect/platform-node/NodeContext"
import Bun from "bun"
import { Console, Effect, Either, Layer } from "effect"
import { CwdLive } from "#services/cwd.ts"
import {
  checkCliExists,
  checkIsMonorepo,
  isJsonObject,
  mergeConfig,
  normalizeDependencyVersion,
  parseJson,
  printTitle,
  readPackageJson,
} from "#utils.ts"

// Helper to run Effect and get Either for error testing
async function runEither<A, E, R>(effect: Effect.Effect<A, E, R>) {
  const provided = effect.pipe(
    Effect.provide(Layer.merge(NodeContext.layer, CwdLive))
  ) as Effect.Effect<A, E>
  return await provided.pipe(Effect.either, Effect.runPromise)
}

describe("utils", () => {
  let testDir: string
  let originalCwd: string

  beforeEach(() => {
    // Create a temporary directory for each test
    testDir = join(tmpdir(), `adamantite-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    originalCwd = process.cwd()
    process.chdir(testDir)
  })

  afterEach(() => {
    // Restore original cwd and cleanup
    process.chdir(originalCwd)
    rmSync(testDir, { force: true, recursive: true })
  })

  describe("readPackageJson", () => {
    test("should read and parse valid package.json", async () => {
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

      await Bun.write(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))

      const result = await readPackageJson(testDir).pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )
      expect(result).toEqual(packageJson)
    })

    test("should use current working directory by default", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
      }

      await Bun.write(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))

      const result = await readPackageJson().pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )
      expect(result).toEqual(packageJson)
    })

    test("should return error when package.json does not exist", async () => {
      const result = await runEither(readPackageJson(testDir))
      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })

    test("should return error when package.json is invalid JSON", async () => {
      await Bun.write(join(testDir, "package.json"), "invalid json content")

      const result = await runEither(readPackageJson(testDir))
      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToParseFile" })
      }
    })
  })

  describe("parseJson", () => {
    test("should parse valid JSON", async () => {
      const validJson = '{"name": "test", "version": "1.0.0"}'
      const result = await parseJson(validJson).pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )

      expect(result).toEqual({
        name: "test",
        version: "1.0.0",
      })
    })

    test("should parse valid JSONC with comments", async () => {
      const jsonc = `{
        // This is a comment
        "name": "test",
        "version": "1.0.0"
      }`
      const result = await parseJson(jsonc).pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )

      expect(result).toEqual({
        name: "test",
        version: "1.0.0",
      })
    })

    test("should parse JSON with trailing commas", async () => {
      const jsonWithTrailingComma = '{"name": "test", "version": "1.0.0",}'
      const result = await parseJson(jsonWithTrailingComma).pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )

      expect(result).toEqual({
        name: "test",
        version: "1.0.0",
      })
    })

    test("should return error for invalid JSON", async () => {
      const invalidJson = '{"name": "test", "version":}'
      const result = await runEither(parseJson(invalidJson))
      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToParseFile" })
      }
    })

    test("should return error for empty string", async () => {
      const result = await runEither(parseJson(""))
      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToParseFile" })
      }
    })
  })

  describe("isJsonObject", () => {
    test("should return true for plain JSON objects", () => {
      expect(isJsonObject({})).toBe(true)
      expect(isJsonObject({ a: 1, b: "x", c: null, d: [1, 2, 3] })).toBe(true)
    })

    test("should return false for null, arrays, and primitives", () => {
      expect(isJsonObject(null)).toBe(false)
      expect(isJsonObject([])).toBe(false)
      expect(isJsonObject([1, 2, 3])).toBe(false)
      expect(isJsonObject("x")).toBe(false)
      expect(isJsonObject(123)).toBe(false)
      expect(isJsonObject(true)).toBe(false)
    })
  })

  describe("mergeConfig", () => {
    test("should merge two objects", async () => {
      const base = { a: 1, b: 2 }
      const override = { b: 3, c: 4 }
      const result = await mergeConfig(base, override).pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )

      // Defu merges left-to-right, so base (first arg) wins for 'b'
      expect(result).toEqual({ a: 1, b: 2, c: 4 })
    })

    test("should give priority to first argument (defu behavior)", async () => {
      const first = { a: 1, b: 2 }
      const second = { a: 3, b: 4 }
      const result = await mergeConfig(first, second).pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )

      // Defu merges left-to-right, so first argument wins
      expect(result).toEqual({ a: 1, b: 2 })
    })

    test("should handle nested objects", async () => {
      const base = { a: { x: 1, y: 2 }, b: 3 }
      const override = { a: { y: 4, z: 5 }, b: 6 }
      const result = await mergeConfig(base, override).pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )

      // Defu merges left-to-right, so base values win
      expect(result).toEqual({ a: { x: 1, y: 2, z: 5 }, b: 3 })
    })

    test("should handle mergeConfig error when defu throws", async () => {
      // Use a Proxy that throws when any property is accessed
      // This simulates defu encountering an error during merge
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

      const result = await runEither(mergeConfig(throwingBase, { b: 2 }))
      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToMergeConfig" })
      }
    })
  })

  describe("checkIsMonorepo", () => {
    test("should return true when pnpm-workspace.yaml exists", async () => {
      await Bun.write(join(testDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'")

      const result = await checkIsMonorepo().pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )
      expect(result).toBe(true)
    })

    test("should return true when package.json has workspaces field", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        workspaces: ["packages/*"],
      }

      await Bun.write(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))

      const result = await checkIsMonorepo().pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )
      expect(result).toBe(true)
    })

    test("should return false when neither condition is met", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
      }

      await Bun.write(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))

      const result = await checkIsMonorepo().pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )
      expect(result).toBe(false)
    })

    test("should return error when package.json does not exist and no pnpm-workspace.yaml", async () => {
      const result = await runEither(checkIsMonorepo())
      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })
  })

  describe("printTitle", () => {
    let capturedLogs: string[]

    beforeEach(() => {
      capturedLogs = []
    })

    const makeTerminalLayer = (columns?: number, rows?: number, isTTY = false) =>
      Layer.succeed(Terminal.Terminal, {
        columns:
          columns === undefined
            ? Effect.succeed(undefined as unknown as number)
            : Effect.succeed(columns),
        display: () => Effect.void,
        isTTY: Effect.succeed(isTTY),
        readInput: Effect.never,
        readLine: Effect.never,
        rows:
          rows === undefined
            ? Effect.succeed(undefined as unknown as number)
            : Effect.succeed(rows),
      })

    const makeConsoleLayer = () => {
      const mockConsole: Console.Console = {
        [Console.TypeId]: Console.TypeId,
        assert: () => Effect.void,
        clear: Effect.void,
        count: () => Effect.void,
        countReset: () => Effect.void,
        debug: () => Effect.void,
        dir: () => Effect.void,
        dirxml: () => Effect.void,
        error: () => Effect.void,
        group: () => Effect.void,
        groupEnd: Effect.void,
        info: (...args: unknown[]) => {
          const message = args.map(String).join(" ")
          capturedLogs.push(message)
          return Effect.void
        },
        log: () => Effect.void,
        table: () => Effect.void,
        time: () => Effect.void,
        timeEnd: () => Effect.void,
        timeLog: () => Effect.void,
        trace: () => Effect.void,
        unsafe: globalThis.console,
        warn: () => Effect.void,
      }
      return Console.setConsole(mockConsole)
    }

    test("should print title when terminal is wide enough", async () => {
      const testLayer = Layer.merge(makeTerminalLayer(120), makeConsoleLayer())

      await printTitle().pipe(Effect.provide(testLayer), Effect.runPromise)

      expect(capturedLogs.length).toBe(1)
      expect(capturedLogs[0]).toContain(".ooooo.")
    })

    test("should not print title when terminal is too narrow", async () => {
      const testLayer = Layer.mergeAll(NodeContext.layer, makeTerminalLayer(50), makeConsoleLayer())

      await printTitle().pipe(Effect.provide(testLayer), Effect.runPromise)

      expect(capturedLogs.length).toBe(0)
    })

    test("should not print title when process.stdout.columns is undefined", async () => {
      const testLayer = Layer.mergeAll(NodeContext.layer, makeTerminalLayer(), makeConsoleLayer())

      await printTitle().pipe(Effect.provide(testLayer), Effect.runPromise)

      expect(capturedLogs.length).toBe(0)
    })
  })

  describe("normalizeDependencyVersion", () => {
    test("should strip caret and tilde prefixes", () => {
      expect(normalizeDependencyVersion("^0.20.0")).toBe("0.20.0")
      expect(normalizeDependencyVersion("~0.20.0")).toBe("0.20.0")
    })

    test("should preserve exact versions", () => {
      expect(normalizeDependencyVersion("0.20.0")).toBe("0.20.0")
    })

    test("should trim whitespace and strip workspace prefix", () => {
      expect(normalizeDependencyVersion("  workspace:^0.20.0  ")).toBe("0.20.0")
    })
  })

  describe("checkCliExists", () => {
    // Note: These tests run actual commands since @effect/platform's Command
    // module doesn't use spawnSync. We use commands guaranteed to exist.
    test("should return ok(true) when CLI exists", async () => {
      // Use 'ls' which exists on all Unix-like systems
      const command = process.platform === "win32" ? "cmd" : "ls"

      const result = await checkCliExists(command).pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )
      expect(result).toBe(true)
    })

    test("should return err with CLI_NOT_FOUND tag when CLI does not exist", async () => {
      const result = await runEither(
        checkCliExists("nonexistent-command-that-definitely-does-not-exist-12345")
      )
      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "CliNotFound" })
      }
    })

    test.skipIf(process.platform !== "win32")("should use 'where' command on Windows", async () => {
      // Use 'cmd' which exists on all Windows systems
      const result = await checkCliExists("cmd").pipe(
        Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
        Effect.runPromise
      )
      expect(result).toBe(true)
    })

    test.skipIf(process.platform === "win32")(
      "should find CLI using 'which' on Unix-like systems",
      async () => {
        // Use 'sh' which exists on all Unix-like systems
        const result = await checkCliExists("sh").pipe(
          Effect.provide(Layer.merge(NodeContext.layer, CwdLive)),
          Effect.runPromise
        )
        expect(result).toBe(true)
      }
    )
  })
})
