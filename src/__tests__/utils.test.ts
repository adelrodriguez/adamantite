import type { PackageJson } from "type-fest"

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Terminal from "effect/Terminal"
import { isLeft, runEither } from "#__tests__/helpers.ts"
import { isJsonObject, mergeConfig, parseJson, serializeTsObjectLiteral } from "#lib/shared/json.ts"
import { checkCliExists } from "#lib/shared/process.ts"
import { printTitle } from "#lib/shared/terminal.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"
import { normalizeDependencyVersion, readPackageJson } from "#lib/workspace/package-json.ts"

const NodeContext = NodeServices
const noop = () => null

let testDir: string
let originalCwd: string

function makeTerminalLayer(columns?: number) {
  return Layer.succeed(Terminal.Terminal)(
    Terminal.make({
      columns:
        columns === undefined
          ? Effect.succeed(undefined as unknown as number)
          : Effect.succeed(columns),
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
    test("read and parse a valid package.json", async () => {
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
        Effect.provide(NodeContext.layer),
        Effect.runPromise
      )

      expect(result).toEqual(packageJson)
    })

    test("return an error when package.json does not exist", async () => {
      const result = await runEither(readPackageJson(testDir), NodeServices.layer)
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })

    test("return an error when package.json contains invalid JSON", async () => {
      await Bun.write(join(testDir, "package.json"), "invalid json content")

      const result = await runEither(readPackageJson(testDir), NodeServices.layer)
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToParseFile" })
      }
    })
  })

  describe("when cwd is omitted", () => {
    test("use the current working directory by default", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
      }

      await Bun.write(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))

      const result = await readPackageJson().pipe(
        Effect.provide(NodeContext.layer),
        Effect.runPromise
      )

      expect(result).toEqual(packageJson)
    })

    test("respect the explicit cwd argument", async () => {
      const fileSystemLayer = FileSystem.layerNoop({
        readFileString: () =>
          Effect.succeed(
            JSON.stringify({
              name: "test-project",
              version: "1.0.0",
            })
          ),
      })

      const result = await readPackageJson("/test/project").pipe(
        Effect.provide(fileSystemLayer),
        Effect.provide(NodeServices.layer),
        Effect.runPromise
      )

      expect(result.name).toBe("test-project")
      expect(result.version).toBe("1.0.0")
    })
  })
})

describe("parseJson", () => {
  test("parse valid JSON", async () => {
    const validJson = '{"name": "test", "version": "1.0.0"}'
    const result = await parseJson(validJson).pipe(
      Effect.provide(NodeContext.layer),
      Effect.runPromise
    )

    expect(result).toEqual({
      name: "test",
      version: "1.0.0",
    })
  })

  test("parse valid JSONC with comments", async () => {
    const jsonc = `{
      // This is a comment
      "name": "test",
      "version": "1.0.0"
    }`
    const result = await parseJson(jsonc).pipe(Effect.provide(NodeContext.layer), Effect.runPromise)

    expect(result).toEqual({
      name: "test",
      version: "1.0.0",
    })
  })

  test("parse JSON with trailing commas", async () => {
    const jsonWithTrailingComma = '{"name": "test", "version": "1.0.0",}'
    const result = await parseJson(jsonWithTrailingComma).pipe(
      Effect.provide(NodeContext.layer),
      Effect.runPromise
    )

    expect(result).toEqual({
      name: "test",
      version: "1.0.0",
    })
  })

  test("return an error for invalid JSON", async () => {
    const invalidJson = '{"name": "test", "version":}'
    const result = await runEither(parseJson(invalidJson), NodeServices.layer)
    expect(isLeft(result)).toBe(true)
    if (isLeft(result)) {
      expect(result.left).toMatchObject({ _tag: "FailedToParseFile" })
    }
  })

  test("return an error for an empty string", async () => {
    const result = await runEither(parseJson(""), NodeServices.layer)
    expect(isLeft(result)).toBe(true)
    if (isLeft(result)) {
      expect(result.left).toMatchObject({ _tag: "FailedToParseFile" })
    }
  })
})

describe("isJsonObject", () => {
  test("return true for plain JSON objects", () => {
    expect(isJsonObject({})).toBe(true)
    expect(isJsonObject({ a: 1, b: "x", c: null, d: [1, 2, 3] })).toBe(true)
  })

  test("return false for null, arrays, and primitives", () => {
    expect(isJsonObject(null)).toBe(false)
    expect(isJsonObject([])).toBe(false)
    expect(isJsonObject([1, 2, 3])).toBe(false)
    expect(isJsonObject("x")).toBe(false)
    expect(isJsonObject(123)).toBe(false)
    expect(isJsonObject(true)).toBe(false)
  })
})

describe("mergeConfig", () => {
  test("merge two objects", async () => {
    const base = { a: 1, b: 2 }
    const override = { b: 3, c: 4 }
    const result = await mergeConfig(base, override).pipe(
      Effect.provide(NodeContext.layer),
      Effect.runPromise
    )

    expect(result).toEqual({ a: 1, b: 2, c: 4 })
  })

  test("give priority to the first argument", async () => {
    const first = { a: 1, b: 2 }
    const second = { a: 3, b: 4 }
    const result = await mergeConfig(first, second).pipe(
      Effect.provide(NodeContext.layer),
      Effect.runPromise
    )

    expect(result).toEqual({ a: 1, b: 2 })
  })

  test("handle nested objects", async () => {
    const base = { a: { x: 1, y: 2 }, b: 3 }
    const override = { a: { y: 4, z: 5 }, b: 6 }
    const result = await mergeConfig(base, override).pipe(
      Effect.provide(NodeContext.layer),
      Effect.runPromise
    )

    expect(result).toEqual({ a: { x: 1, y: 2, z: 5 }, b: 3 })
  })

  test("return an error when defu throws", async () => {
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

    const result = await runEither(mergeConfig(throwingBase, { b: 2 }), NodeServices.layer)
    expect(isLeft(result)).toBe(true)
    if (isLeft(result)) {
      expect(result.left).toMatchObject({ _tag: "FailedToMergeConfig" })
    }
  })
})

describe("serializeTsObjectLiteral", () => {
  test("serialize objects as TypeScript object literals", () => {
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

  test("keep non-identifier keys quoted", () => {
    const result = serializeTsObjectLiteral({
      "foo-bar": true,
      validKey: false,
    })

    expect(result).toBe(`{
  "foo-bar": true,
  validKey: false
}`)
  })

  test("indent continuation lines when embedding multiline values", () => {
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

  test("support custom indentation strings", () => {
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
    test("respect the explicit cwd argument", async () => {
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

      const result = await checkIsMonorepo("/test/project").pipe(
        Effect.provide(fileSystemLayer),
        Effect.provide(NodeServices.layer),
        Effect.runPromise
      )

      expect(result).toBe(true)
    })
  })

  describe("when workspace files are present", () => {
    test("return true when pnpm-workspace.yaml exists", async () => {
      await Bun.write(join(testDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'")

      const result = await checkIsMonorepo(testDir).pipe(
        Effect.provide(NodeContext.layer),
        Effect.runPromise
      )

      expect(result).toBe(true)
    })

    test("return true when package.json has a workspaces field", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        workspaces: ["packages/*"],
      }

      await Bun.write(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))

      const result = await checkIsMonorepo(testDir).pipe(
        Effect.provide(NodeContext.layer),
        Effect.runPromise
      )

      expect(result).toBe(true)
    })
  })

  describe("when workspace files are absent", () => {
    test("return false when neither condition is met", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
      }

      await Bun.write(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))

      const result = await checkIsMonorepo(testDir).pipe(
        Effect.provide(NodeContext.layer),
        Effect.runPromise
      )

      expect(result).toBe(false)
    })

    test("return an error when package.json does not exist", async () => {
      const result = await runEither(checkIsMonorepo(testDir), NodeServices.layer)
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })
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

  test("print the title when the terminal is wide enough", async () => {
    const testLayer = Layer.merge(makeTerminalLayer(120), makeConsoleLayer())

    await Effect.runPromise(printTitle().pipe(Effect.provide(testLayer)))

    expect(capturedLogs.length).toBe(1)
    expect(capturedLogs[0]).toContain(".ooooo.")
  })

  test("not print the title when the terminal is too narrow", async () => {
    const testLayer = Layer.mergeAll(NodeContext.layer, makeTerminalLayer(50), makeConsoleLayer())

    await Effect.runPromise(printTitle().pipe(Effect.provide(testLayer)))

    expect(capturedLogs.length).toBe(0)
  })

  test("not print the title when process.stdout.columns is undefined", async () => {
    const testLayer = Layer.mergeAll(NodeContext.layer, makeTerminalLayer(), makeConsoleLayer())

    await Effect.runPromise(printTitle().pipe(Effect.provide(testLayer)))

    expect(capturedLogs.length).toBe(0)
  })
})

describe("normalizeDependencyVersion", () => {
  test("strip caret and tilde prefixes", () => {
    expect(normalizeDependencyVersion("^0.20.0")).toBe("0.20.0")
    expect(normalizeDependencyVersion("~0.20.0")).toBe("0.20.0")
  })

  test("preserve exact versions", () => {
    expect(normalizeDependencyVersion("0.20.0")).toBe("0.20.0")
  })

  test("trim whitespace and strip the workspace prefix", () => {
    expect(normalizeDependencyVersion("  workspace:^0.20.0  ")).toBe("0.20.0")
  })
})

describe("checkCliExists", () => {
  test("return ok(true) when the CLI exists", async () => {
    const command = process.platform === "win32" ? "cmd" : "ls"

    const result = await checkCliExists(command).pipe(
      Effect.provide(NodeContext.layer),
      Effect.runPromise
    )

    expect(result).toBe(true)
  })

  test("return a CliNotFound error when the CLI does not exist", async () => {
    const result = await runEither(
      checkCliExists("nonexistent-command-that-definitely-does-not-exist-12345"),
      NodeServices.layer
    )
    expect(isLeft(result)).toBe(true)
    if (isLeft(result)) {
      expect(result.left).toMatchObject({ _tag: "CliNotFound" })
    }
  })

  test.skipIf(process.platform !== "win32")("use the where command on Windows", async () => {
    const result = await checkCliExists("cmd").pipe(
      Effect.provide(NodeContext.layer),
      Effect.runPromise
    )

    expect(result).toBe(true)
  })

  test.skipIf(process.platform === "win32")(
    "find the CLI with which on Unix-like systems",
    async () => {
      const result = await checkCliExists("sh").pipe(
        Effect.provide(NodeContext.layer),
        Effect.runPromise
      )

      expect(result).toBe(true)
    }
  )
})
