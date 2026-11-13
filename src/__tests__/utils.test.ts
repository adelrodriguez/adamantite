import { describe, expect, it } from "@effect/vitest"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Terminal from "effect/Terminal"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { FailedToParseFile, FailedToReadFile, InvalidPackageJson } from "#lib/shared/errors.ts"
import { checkIsPlainJson, mergeConfig, stringifyJson } from "#lib/shared/json.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"
import {
  matchDeclaredVersion,
  parseDependencySpecifier,
  readPackageJson,
} from "#lib/workspace/package-json.ts"
import { printTitle } from "#terminal/title.ts"

const ROOT = "/project"
const noop = () => null

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([files.layer, Path.layer])
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
      size: Effect.never,
    })
  )
}

describe("readPackageJson", () => {
  it.effect("return an error when package.json does not exist", () =>
    Effect.gen(function* () {
      const files = makeFiles()

      const result = yield* Effect.result(readPackageJson(ROOT).pipe(provideFiles(files)))

      expect(Result.isFailure(result)).toBe(true)

      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(FailedToReadFile)
      }
    })
  )

  it.effect.each([
    ["null", "null"],
    ["an array", "[]"],
    ["scripts as a string", '{ "scripts": "build" }'],
    ["workspaces packages as a string", '{ "workspaces": { "packages": "packages/*" } }'],
    ["a dependency version as a number", '{ "devDependencies": { "oxlint": 1 } }'],
  ] as const)("reject a package.json with %s", ([, content]) =>
    Effect.gen(function* () {
      const files = makeFiles({ "package.json": content })

      const error = yield* Effect.flip(readPackageJson(ROOT).pipe(provideFiles(files)))

      expect(error).toBeInstanceOf(InvalidPackageJson)
      expect(error.message).toMatch(
        /^`\/project\/package\.json` is not a valid `package\.json`\. Expected /
      )
    })
  )

  it.effect("keep the fields that Adamantite does not read", () =>
    Effect.gen(function* () {
      const manifest = { devEngines: { runtime: { name: "node" } }, name: "app", private: true }
      const files = makeFiles({ "package.json": yield* stringifyJson(manifest) })

      expect(yield* readPackageJson(ROOT).pipe(provideFiles(files))).toStrictEqual(manifest)
    })
  )
})

describe("readPackageJson parse errors", () => {
  it.effect("read a __proto__ key as an own key, not as the prototype", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "package.json":
          '{ "name": "app", "private": true, "__proto__": { "devDependencies": { "adamantite": "0.47.0" } } }',
      })

      const manifest = yield* readPackageJson(ROOT).pipe(provideFiles(files))

      expect({
        devDependencies: manifest.devDependencies,
        ownKeys: Object.keys(manifest),
      }).toStrictEqual({ devDependencies: undefined, ownKeys: ["name", "private", "__proto__"] })
    })
  )

  it.effect("fail with the line and column of a syntax error", () =>
    Effect.gen(function* () {
      const files = makeFiles({ "package.json": '{\n  "name": "test"\n  "version": "1.0.0"\n}\n' })

      const result = yield* Effect.result(readPackageJson(ROOT).pipe(provideFiles(files)))

      expect(Result.isFailure(result)).toBe(true)

      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(FailedToParseFile)
        expect(result.failure.message).toContain("Cause: Invalid JSONC at line 3, column 3.")
      }
    })
  )
})

describe("checkIsPlainJson", () => {
  it.each([
    { content: '{ "a": [1, 2] }', expected: true, name: "plain JSON" },
    { content: '{\n  // note\n  "a": 1\n}', expected: false, name: "a line comment" },
    { content: '{ /* note */ "a": 1 }', expected: false, name: "a block comment" },
    { content: '{ "a": 1, }', expected: false, name: "a trailing comma" },
    {
      content: '{ "a": "// not a comment" }',
      expected: true,
      name: "a comment marker in a string",
    },
    { content: '{ "a": }', expected: false, name: "invalid JSON" },
  ])("return $expected for $name", ({ content, expected }) => {
    expect(checkIsPlainJson(content)).toBe(expected)
  })
})

describe("mergeConfig", () => {
  it.effect(
    "keep the preferred keys in their order, then add the keys that only the fallback has",
    () =>
      Effect.gen(function* () {
        // The project's file lists `m`, `b`, and `a` in that order. Entries keep the order, which an
        // object literal would lose to the key sort.
        const preferred = Object.fromEntries([
          ["m", true],
          ["b", false],
          ["a", 3],
        ])

        const merged = yield* mergeConfig({ fallback: { a: 1, z: 2 }, preferred })

        expect(Object.keys(merged)).toStrictEqual(["m", "b", "a", "z"])
      })
  )

  // mergeConfig concatenates arrays on conflicts, so this property holds on array-free configs.
  const jsonPrimitive = Schema.Union([Schema.String, Schema.Int, Schema.Boolean, Schema.Null])

  const arrayFreeConfig = Schema.Record(
    Schema.String,
    Schema.Union([
      jsonPrimitive,
      Schema.Record(Schema.String, jsonPrimitive).check(Schema.isMaxProperties(4)),
    ])
  ).check(Schema.isMaxProperties(8))

  it.effect.prop(
    "keep every key from both inputs and prefer the preferred values on conflicts",
    { fallback: arrayFreeConfig, preferred: arrayFreeConfig },
    ({ fallback, preferred }) =>
      Effect.gen(function* () {
        const merged = yield* mergeConfig({ fallback, preferred })

        for (const key of [...Object.keys(preferred), ...Object.keys(fallback)]) {
          expect(Object.hasOwn(merged, key)).toBe(true)
        }

        for (const [key, value] of Object.entries(preferred)) {
          if (!Predicate.isObject(value)) {
            expect(merged[key]).toBe(value)
          }
        }

        for (const key of Object.keys(fallback)) {
          if (!Object.hasOwn(preferred, key)) {
            expect(merged[key]).toStrictEqual(fallback[key])
          }
        }
      }),
    { arbitrary: { runs: 200 } }
  )
})

describe("checkIsMonorepo", () => {
  it.effect.each([
    {
      content: "packages:\n  - 'packages/*'",
      expected: true,
      file: "pnpm-workspace.yaml",
      name: "pnpm-workspace.yaml defines packages",
    },
    {
      content: "\uFEFFpackages:\n  - 'packages/*'\n",
      expected: true,
      file: "pnpm-workspace.yaml",
      name: "pnpm workspace content starts with a byte-order mark",
    },
    {
      content: "\"packages\":\n  - 'packages/*'\n",
      expected: true,
      file: "pnpm-workspace.yaml",
      name: "pnpm quotes the packages key",
    },
    {
      content: "allowBuilds:\n  msgpackr-extract: false\n",
      expected: false,
      file: "pnpm-workspace.yaml",
      name: "pnpm-workspace.yaml does not define packages",
    },
    {
      content: "packages: [] # no workspace packages\n",
      expected: false,
      file: "pnpm-workspace.yaml",
      name: "pnpm declares an empty package list with a comment",
    },
    {
      content: "packages: [\n]\n",
      expected: false,
      file: "pnpm-workspace.yaml",
      name: "pnpm declares an empty multiline flow sequence",
    },
    {
      content: "packages: [\n  'packages/*',\n]\n",
      expected: true,
      file: "pnpm-workspace.yaml",
      name: "pnpm declares packages in a multiline flow sequence",
    },
    {
      content: 'packages: &workspacePackages ["packages/*"]\n',
      expected: true,
      file: "pnpm-workspace.yaml",
      name: "pnpm anchors a flow sequence of packages",
    },
    {
      content:
        'workspacePackages: &workspacePackages ["packages/*"]\npackages: *workspacePackages\n',
      expected: true,
      file: "pnpm-workspace.yaml",
      name: "pnpm aliases an anchored list of packages",
    },
    {
      content: "packages: &workspacePackages\n  - packages/*\n",
      expected: true,
      file: "pnpm-workspace.yaml",
      name: "pnpm anchors a block sequence of packages",
    },
    {
      content: JSON.stringify({ workspaces: ["packages/*"] }),
      expected: true,
      file: "package.json",
      name: "package.json has a workspaces field",
    },
    {
      content: JSON.stringify({ workspaces: { packages: ["packages/*"] } }),
      expected: true,
      file: "package.json",
      name: "package.json has workspace packages in object form",
    },
    {
      content: JSON.stringify({ workspaces: { packages: [] } }),
      expected: false,
      file: "package.json",
      name: "package.json has no workspace packages in object form",
    },
    {
      content: JSON.stringify({ workspaces: [] }),
      expected: false,
      file: "package.json",
      name: "package.json has no workspace packages",
    },
    {
      content: JSON.stringify({ name: "test-package", version: "1.0.0" }),
      expected: false,
      file: "package.json",
      name: "neither pnpm-workspace.yaml nor workspaces is present",
    },
  ])("return $expected when $name", ({ content, expected, file }) =>
    Effect.gen(function* () {
      // A case for `package.json` replaces the default one.
      const defaults = { "package.json": yield* stringifyJson({ name: "test-package" }) }
      const files = makeFiles({ ...defaults, [file]: content })

      const result = yield* checkIsMonorepo(ROOT).pipe(provideFiles(files))

      expect(result).toBe(expected)
    })
  )
})

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

describe("printTitle", () => {
  it.effect("print the title when the terminal is wide enough", () =>
    Effect.gen(function* () {
      const console = makeConsoleContext()

      yield* printTitle.pipe(Effect.provide(Layer.merge(makeTerminalLayer(120), console.layer)))

      expect(console.capturedLogs).toHaveLength(1)
      expect(console.capturedLogs[0]).toContain(".ooooo.")
    })
  )

  it.effect("not print the title when the terminal is too narrow", () =>
    Effect.gen(function* () {
      const console = makeConsoleContext()

      yield* printTitle.pipe(Effect.provide(Layer.merge(makeTerminalLayer(50), console.layer)))

      expect(console.capturedLogs).toHaveLength(0)
    })
  )

  it.effect("not print the title when process.stdout.columns is undefined", () =>
    Effect.gen(function* () {
      const console = makeConsoleContext()

      yield* printTitle.pipe(Effect.provide(Layer.merge(makeTerminalLayer(), console.layer)))

      expect(console.capturedLogs).toHaveLength(0)
    })
  )
})

function describeSpecifier(specifier: string) {
  return matchDeclaredVersion(parseDependencySpecifier(specifier), {
    Catalog: ({ catalog }) => `catalog ${catalog}`,
    Unreadable: () => "unreadable",
    Version: ({ version }) => `version ${version}`,
  })
}

describe("parseDependencySpecifier", () => {
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

      expect(describeSpecifier(specifier)).toBe(`version ${versionCore}`)
    },
    { arbitrary: { runs: 500 } }
  )

  it.each([
    ["catalog:", "catalog default"],
    ["catalog:tools", "catalog tools"],
    ["0.21.0-ts7.1.0-beta", "version 0.21.0-ts7.1.0-beta"],
    ["npm:oxlint@1.2.3", "unreadable"],
    ["workspace:*", "unreadable"],
    [">=1.2.3", "unreadable"],
    ["link:../oxlint", "unreadable"],
  ])("read %s", (specifier, expected) => {
    expect(describeSpecifier(specifier)).toBe(expected)
  })
})
