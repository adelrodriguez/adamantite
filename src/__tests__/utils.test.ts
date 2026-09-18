import type { JsonValue, PackageJson } from "type-fest"

import { describe, expect, it } from "@effect/vitest"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Terminal from "effect/Terminal"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { mergeConfig, parseJson } from "#lib/shared/json.ts"
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
      value: Schema.MutableJson.check(
        Schema.makeFilter((value) => !someKey(value, (key) => key === "__proto__"))
      ),
    },
    ({ value }) =>
      Effect.gen(function* () {
        const parsed = yield* parseJson(JSON.stringify(value))

        expect(JSON.stringify(parsed)).toBe(JSON.stringify(value))
      }),
    { arbitrary: { runs: 300 } }
  )

  it.effect.prop(
    "resolve to success or FailedToParseFile for arbitrary input, never a defect",
    { content: Schema.String },
    ({ content }) =>
      Effect.gen(function* () {
        const result = yield* Effect.result(parseJson(content))

        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToParseFile" })
        }
      }),
    { arbitrary: { runs: 500 } }
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
  const jsonPrimitive = Schema.Union([Schema.String, Schema.Int, Schema.Boolean])
  const plainKey = Schema.String.check(
    Schema.makeFilter((key) => key !== "__proto__" && key !== "constructor")
  )
  const arrayFreeConfig = Schema.Record(
    plainKey,
    Schema.Union([
      jsonPrimitive,
      Schema.Record(plainKey, jsonPrimitive).check(Schema.isMaxProperties(4)),
    ])
  ).check(Schema.isMaxProperties(8))

  it.effect.prop(
    "treat the empty object as the identity on both sides",
    { config: arrayFreeConfig },
    ({ config }) =>
      Effect.gen(function* () {
        expect(yield* mergeConfig(config, {})).toEqual(config)
        expect(yield* mergeConfig({}, config)).toEqual(config)
      }),
    { arbitrary: { runs: 200 } }
  )

  it.effect.prop(
    "merge any config with itself without changing it",
    { config: arrayFreeConfig },
    ({ config }) =>
      Effect.gen(function* () {
        expect(yield* mergeConfig(config, config)).toEqual(config)
      }),
    { arbitrary: { runs: 200 } }
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
    { arbitrary: { runs: 200 } }
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
    it.effect("return true when pnpm-workspace.yaml defines packages", () =>
      Effect.gen(function* () {
        const files = makeFiles({ "pnpm-workspace.yaml": "packages:\n  - 'packages/*'" })

        const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

        expect(result).toBe(true)
      })
    )

    it.effect("return true when pnpm workspace content starts with a byte-order mark", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify({ name: "test-package" }),
          "pnpm-workspace.yaml": "\uFEFFpackages:\n  - 'packages/*'\n",
        })

        const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

        expect(result).toBe(true)
      })
    )

    it.effect("return true when pnpm quotes the packages key", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify({ name: "test-package" }),
          "pnpm-workspace.yaml": "\"packages\":\n  - 'packages/*'\n",
        })

        const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

        expect(result).toBe(true)
      })
    )

    it.effect("return false when pnpm-workspace.yaml does not define packages", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify({ name: "test-package" }),
          "pnpm-workspace.yaml": "allowBuilds:\n  msgpackr-extract: false\n",
        })

        const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

        expect(result).toBe(false)
      })
    )

    it.effect("return false when pnpm declares an empty package list with a comment", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify({ name: "test-package" }),
          "pnpm-workspace.yaml": "packages: [] # no workspace packages\n",
        })

        const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

        expect(result).toBe(false)
      })
    )

    it.effect("return false when pnpm declares an empty multiline flow sequence", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify({ name: "test-package" }),
          "pnpm-workspace.yaml": "packages: [\n]\n",
        })

        const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

        expect(result).toBe(false)
      })
    )

    it.effect("return true when pnpm declares packages in a multiline flow sequence", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify({ name: "test-package" }),
          "pnpm-workspace.yaml": "packages: [\n  'packages/*',\n]\n",
        })

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

    it.effect("return true when package.json has workspace packages in object form", () =>
      Effect.gen(function* () {
        const packageJson: PackageJson = {
          name: "test-package",
          workspaces: { packages: ["packages/*"] },
        }
        const files = makeFiles({ "package.json": JSON.stringify(packageJson, null, 2) })

        const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

        expect(result).toBe(true)
      })
    )

    it.effect("return false when package.json has no workspace packages in object form", () =>
      Effect.gen(function* () {
        const packageJson: PackageJson = {
          name: "test-package",
          workspaces: { packages: [] },
        }
        const files = makeFiles({ "package.json": JSON.stringify(packageJson, null, 2) })

        const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

        expect(result).toBe(false)
      })
    )

    it.effect("return false when package.json has no workspace packages", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify({ name: "test-package", workspaces: [] }),
        })

        const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

        expect(result).toBe(false)
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
  const versionNumber = Schema.Int.check(Schema.isBetween({ maximum: 99, minimum: 0 }))
  const version = Schema.TemplateLiteral([
    versionNumber,
    ".",
    versionNumber,
    ".",
    versionNumber,
    Schema.Literals(["", "-alpha", "-beta.1", "-rc.0"]),
  ])
  const specifierParts = {
    padding: Schema.Literals(["", " ", "  ", "\t"]),
    rangePrefix: Schema.Literals(["", "^", "~"]),
    version,
    workspacePrefix: Schema.Literals(["", "workspace:"]),
  }

  it.prop(
    "recover the exact version from any padded, prefixed specifier",
    specifierParts,
    ({ padding, rangePrefix, version: versionCore, workspacePrefix }) => {
      const specifier = `${padding}${workspacePrefix}${rangePrefix}${versionCore}${padding}`

      expect(normalizeDependencyVersion(specifier)).toBe(versionCore)
    },
    { arbitrary: { runs: 500 } }
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
    { arbitrary: { runs: 500 } }
  )
})
