import type { JsonValue, PackageJson } from "type-fest"

import { describe, expect, it } from "@effect/vitest"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Result from "effect/Result"
import * as Terminal from "effect/Terminal"
import { FastCheck } from "effect/testing"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { mergeConfig, parseJson, serializeTsObjectLiteral } from "#lib/shared/json.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"
import { normalizeDependencyVersion, readPackageJson } from "#lib/workspace/package-json.ts"
import { printTitle } from "#terminal/title.ts"

const ROOT = "/project"
const noop = () => null

function someKey(value: JsonValue, predicate: (key: string) => boolean): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => someKey(entry, predicate))
  }

  if (Predicate.isObject(value)) {
    return Object.entries(value).some(([key, entry]) => predicate(key) || someKey(entry, predicate))
  }

  return false
}

// SAFETY: fast-check's JsonValue and type-fest's JsonValue describe the same JSON data shapes.
const jsonValueArbitrary = FastCheck.jsonValue({ maxDepth: 4 }).map((value) => value as JsonValue)

async function evaluateTsLiteral(serialized: string): Promise<JsonValue> {
  const uri = `data:text/javascript,export default (${encodeURIComponent(serialized)})`
  // SAFETY: the module evaluates a serialized JSON value, so its default export is a JsonValue.
  const module = (await import(/* @vite-ignore */ uri)) as { default: JsonValue }

  return module.default
}

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

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
        const files = makeFiles({ "package.json": JSON.stringify(packageJson, null, 2) })

        const result = yield* readPackageJson(ROOT).pipe(provideFiles(files))

        expect(result).toEqual(packageJson)
      })
    )

    it.effect("return an error when package.json does not exist", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const result = yield* Effect.result(readPackageJson(ROOT).pipe(provideFiles(files)))

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
        }
      })
    )

    it.effect("return an error when package.json contains invalid JSON", () =>
      Effect.gen(function* () {
        const files = makeFiles({ "package.json": "invalid json content" })

        const result = yield* Effect.result(readPackageJson(ROOT).pipe(provideFiles(files)))

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
        const files = createFileSystemTestContext({
          files: { "package.json": JSON.stringify(packageJson, null, 2) },
        })

        const result = yield* readPackageJson().pipe(provideFiles(files))

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
          Effect.provide(Layer.mergeAll(fileSystemLayer, Path.layer))
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
      const result = yield* parseJson(validJson)

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
      const result = yield* parseJson(jsonc)

      expect(result).toEqual({
        name: "test",
        version: "1.0.0",
      })
    })
  )

  it.effect("parse JSON with trailing commas", () =>
    Effect.gen(function* () {
      const jsonWithTrailingComma = '{"name": "test", "version": "1.0.0",}'
      const result = yield* parseJson(jsonWithTrailingComma)

      expect(result).toEqual({
        name: "test",
        version: "1.0.0",
      })
    })
  )

  it.effect("return an error for invalid JSON", () =>
    Effect.gen(function* () {
      const invalidJson = '{"name": "test", "version":}'
      const result = yield* Effect.result(parseJson(invalidJson))

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToParseFile" })
      }
    })
  )

  it.effect("return an error for an empty string", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(parseJson(""))

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToParseFile" })
      }
    })
  )

  it.effect("strip __proto__ keys (jsonc-parser pollution protection)", () =>
    Effect.gen(function* () {
      const parsed = yield* parseJson('{"__proto__": {"polluted": true}, "a": 1}')

      expect(parsed).toEqual({ a: 1 })
    })
  )

  it.effect.prop(
    "round-trip any JSON value without __proto__ keys through JSON.stringify",
    {
      value: jsonValueArbitrary.filter((value) => !someKey(value, (key) => key === "__proto__")),
    },
    ({ value }) =>
      Effect.gen(function* () {
        const parsed = yield* parseJson(JSON.stringify(value))

        expect(JSON.stringify(parsed)).toBe(JSON.stringify(value))
      }),
    { fastCheck: { numRuns: 300 } }
  )

  it.effect.prop(
    "resolve to success or FailedToParseFile for arbitrary input, never a defect",
    { content: FastCheck.string() },
    ({ content }) =>
      Effect.gen(function* () {
        const result = yield* Effect.result(parseJson(content))

        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToParseFile" })
        }
      }),
    { fastCheck: { numRuns: 500 } }
  )
})

describe("mergeConfig", () => {
  it.effect("merge two objects", () =>
    Effect.gen(function* () {
      const base = { a: 1, b: 2 }
      const override = { b: 3, c: 4 }
      const result = yield* mergeConfig(base, override)

      expect(result).toEqual({ a: 1, b: 2, c: 4 })
    })
  )

  it.effect("give priority to the first argument", () =>
    Effect.gen(function* () {
      const first = { a: 1, b: 2 }
      const second = { a: 3, b: 4 }
      const result = yield* mergeConfig(first, second)

      expect(result).toEqual({ a: 1, b: 2 })
    })
  )

  it.effect("handle nested objects", () =>
    Effect.gen(function* () {
      const base = { a: { x: 1, y: 2 }, b: 3 }
      const override = { a: { y: 4, z: 5 }, b: 6 }
      const result = yield* mergeConfig(base, override)

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

      const result = yield* Effect.result(mergeConfig(throwingBase, { b: 2 }))

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToMergeConfig" })
      }
    })
  )

  it.effect("drop null-valued keys from the first argument (defu behavior)", () =>
    Effect.gen(function* () {
      expect(yield* mergeConfig({ a: null }, {})).toEqual({})
      expect(yield* mergeConfig({}, { a: null })).toEqual({ a: null })
    })
  )

  // defu drops `__proto__`/`constructor` keys and null-valued keys from its first argument, and
  // concatenates arrays on conflicts, so these algebraic properties hold on array-free, null-free
  // configs with plain keys.
  const jsonPrimitive = FastCheck.oneof(
    FastCheck.string(),
    FastCheck.integer(),
    FastCheck.boolean()
  )
  const plainKey = FastCheck.string().filter((key) => key !== "__proto__" && key !== "constructor")
  const arrayFreeConfig = FastCheck.dictionary(
    plainKey,
    FastCheck.oneof(jsonPrimitive, FastCheck.dictionary(plainKey, jsonPrimitive, { maxKeys: 4 })),
    { maxKeys: 8 }
  )

  it.effect.prop(
    "treat the empty object as the identity on both sides",
    { config: arrayFreeConfig },
    ({ config }) =>
      Effect.gen(function* () {
        expect(yield* mergeConfig(config, {})).toEqual(config)
        expect(yield* mergeConfig({}, config)).toEqual(config)
      }),
    { fastCheck: { numRuns: 200 } }
  )

  it.effect.prop(
    "merge any config with itself without changing it",
    { config: arrayFreeConfig },
    ({ config }) =>
      Effect.gen(function* () {
        expect(yield* mergeConfig(config, config)).toEqual(config)
      }),
    { fastCheck: { numRuns: 200 } }
  )

  it.effect.prop(
    "keep every key from both inputs and prefer the first argument on conflicts",
    { base: arrayFreeConfig, override: arrayFreeConfig },
    ({ base, override }) =>
      Effect.gen(function* () {
        const merged = yield* mergeConfig(base, override)

        for (const key of [...Object.keys(base), ...Object.keys(override)]) {
          expect(Object.hasOwn(merged, key)).toBe(true)
        }
        for (const [key, value] of Object.entries(base)) {
          if (!Predicate.isObject(value)) {
            expect(merged[key]).toBe(value)
          }
        }
        for (const key of Object.keys(override)) {
          if (!Object.hasOwn(base, key)) {
            expect(merged[key]).toEqual(override[key])
          }
        }
      }),
    { fastCheck: { numRuns: 200 } }
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

  // Both known bugs come from the key-unquoting regex matching text it should not: the escaped
  // quote in a serialized key produces a bare `"A":` substring, and `__proto__` is a valid
  // identifier but means prototype assignment once unquoted.
  it.fails("known bug: a key containing a double quote produces invalid syntax", async () => {
    const value = { '"A': null }
    const evaluated = await evaluateTsLiteral(serializeTsObjectLiteral(value))

    expect(JSON.stringify(evaluated)).toBe(JSON.stringify(value))
  })

  it.fails("known bug: an unquoted __proto__ key changes the evaluated object", async () => {
    // SAFETY: JSON.parse creates `__proto__` as an own property, unlike an object literal.
    const value = JSON.parse('{"__proto__": {"polluted": true}}') as JsonValue
    const evaluated = await evaluateTsLiteral(serializeTsObjectLiteral(value))

    expect(JSON.stringify(evaluated)).toBe(JSON.stringify(value))
  })

  const hazardFreeJsonValue = jsonValueArbitrary.filter(
    (value) => !someKey(value, (key) => key.includes('"') || key === "__proto__")
  )

  it.effect.prop(
    "evaluate back to the original value for any JSON value without hazardous keys",
    { value: hazardFreeJsonValue },
    ({ value }) =>
      Effect.gen(function* () {
        const evaluated = yield* Effect.promise(() =>
          evaluateTsLiteral(serializeTsObjectLiteral(value))
        )

        expect(JSON.stringify(evaluated)).toBe(JSON.stringify(value))
      }),
    { fastCheck: { numRuns: 300 } }
  )

  // Focused generator for the risky surface: identifier-like keys next to string values full of
  // quotes, backslashes, colons, and braces that the key-unquoting regex could corrupt. Escaping
  // keeps string values safe; only keys containing a double quote break (pinned above).
  const trickyString = FastCheck.array(
    FastCheck.constantFrom('"', "\\", ":", "\n", " ", "a", "$", "_", "{", "}", "'", "`"),
    { maxLength: 12 }
  ).map((chars) => chars.join(""))
  const trickyKey = FastCheck.oneof(
    FastCheck.constantFrom("enabled", "entry", "$schema", "_private", "a1"),
    trickyString.map((text) => text.replaceAll('"', ""))
  )
  const trickyObject = FastCheck.dictionary(
    trickyKey,
    FastCheck.oneof(trickyString, FastCheck.dictionary(trickyKey, trickyString, { maxKeys: 3 })),
    { maxKeys: 6 }
  )

  it.effect.prop(
    "never corrupt string values that look like keys, at any indentation",
    { indentation: FastCheck.constantFrom<number | string>(0, 2, 4, "\t"), value: trickyObject },
    ({ indentation, value }) =>
      Effect.gen(function* () {
        const evaluated = yield* Effect.promise(() =>
          evaluateTsLiteral(serializeTsObjectLiteral(value, { indentation }))
        )

        expect(JSON.stringify(evaluated)).toBe(JSON.stringify(value))
      }),
    { fastCheck: { numRuns: 500 } }
  )
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
          Effect.provide(Layer.mergeAll(fileSystemLayer, Path.layer))
        )

        expect(result).toBe(true)
      })
    )
  })

  describe("when workspace files are present", () => {
    it.effect("return true when pnpm-workspace.yaml exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({ "pnpm-workspace.yaml": "packages:\n  - 'packages/*'" })

        const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

        expect(result).toBe(true)
      })
    )

    it.effect("return true when package.json has a workspaces field", () =>
      Effect.gen(function* () {
        const packageJson: PackageJson = {
          name: "test-package",
          workspaces: ["packages/*"],
        }
        const files = makeFiles({ "package.json": JSON.stringify(packageJson, null, 2) })

        const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

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
        const files = makeFiles({ "package.json": JSON.stringify(packageJson, null, 2) })

        const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

        expect(result).toBe(false)
      })
    )

    it.effect("return an error when package.json does not exist", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const result = yield* Effect.result(checkIsMonorepo(ROOT).pipe(provideFiles(files)))

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
        }
      })
    )
  })
})

describe("printTitle", () => {
  function makeConsoleContext() {
    const capturedLogs: string[] = []
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

    return { capturedLogs, layer: Layer.succeed(Console.Console)(mockConsole) }
  }

  it.effect("print the title when the terminal is wide enough", () =>
    Effect.gen(function* () {
      const console = makeConsoleContext()

      yield* printTitle().pipe(Effect.provide(Layer.merge(makeTerminalLayer(120), console.layer)))

      expect(console.capturedLogs.length).toBe(1)
      expect(console.capturedLogs[0]).toContain(".ooooo.")
    })
  )

  it.effect("not print the title when the terminal is too narrow", () =>
    Effect.gen(function* () {
      const console = makeConsoleContext()

      yield* printTitle().pipe(Effect.provide(Layer.merge(makeTerminalLayer(50), console.layer)))

      expect(console.capturedLogs.length).toBe(0)
    })
  )

  it.effect("not print the title when process.stdout.columns is undefined", () =>
    Effect.gen(function* () {
      const console = makeConsoleContext()

      yield* printTitle().pipe(Effect.provide(Layer.merge(makeTerminalLayer(), console.layer)))

      expect(console.capturedLogs.length).toBe(0)
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

  // The input domain is real dependency specifiers: optional whitespace padding, an optional
  // `workspace:` protocol, and at most one range prefix. Stacked prefixes like `~~1.0.0` are not
  // valid specifiers and are out of scope.
  const version = FastCheck.tuple(
    FastCheck.nat({ max: 99 }),
    FastCheck.nat({ max: 99 }),
    FastCheck.nat({ max: 99 }),
    FastCheck.option(FastCheck.constantFrom("-alpha", "-beta.1", "-rc.0"))
  ).map(([major, minor, patch, prerelease]) => `${major}.${minor}.${patch}${prerelease ?? ""}`)
  const specifierParts = {
    padding: FastCheck.constantFrom("", " ", "  ", "\t"),
    rangePrefix: FastCheck.constantFrom("", "^", "~"),
    version,
    workspacePrefix: FastCheck.constantFrom("", "workspace:"),
  }

  it.prop(
    "recover the exact version from any padded, prefixed specifier",
    specifierParts,
    ({ padding, rangePrefix, version: versionCore, workspacePrefix }) => {
      const specifier = `${padding}${workspacePrefix}${rangePrefix}${versionCore}${padding}`

      expect(normalizeDependencyVersion(specifier)).toBe(versionCore)
    },
    { fastCheck: { numRuns: 500 } }
  )

  it.prop(
    "be idempotent on the specifier domain",
    specifierParts,
    ({ padding, rangePrefix, version: versionCore, workspacePrefix }) => {
      const once = normalizeDependencyVersion(
        `${padding}${workspacePrefix}${rangePrefix}${versionCore}${padding}`
      )

      expect(normalizeDependencyVersion(once)).toBe(once)
    },
    { fastCheck: { numRuns: 500 } }
  )
})
