import type { JsonValue } from "type-fest"

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
import { mergeConfig, parseJson, updateJsonText } from "#lib/shared/json.ts"
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
})

describe("parseJson", () => {
  it.effect("parse JSON with trailing commas", () =>
    Effect.gen(function* () {
      const jsonWithTrailingComma = '{"name": "test", "version": "1.0.0",}'
      const result = yield* parseJson(jsonWithTrailingComma)

      expect(result).toStrictEqual({
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
})

describe("mergeConfig", () => {
  // defu drops `__proto__`/`constructor` keys and null-valued keys from its first argument, and
  // concatenates arrays on conflicts, so this property holds on array-free, null-free configs with
  // plain keys.
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
            expect(merged[key]).toStrictEqual(override[key])
          }
        }
      }),
    { arbitrary: { runs: 200 } }
  )
})

describe("updateJsonText", () => {
  it("keep comments and trailing commas when it adds keys", () => {
    const content = `{
  // Editor settings
  "editor.tabSize": 4, // keep four
  "[json]": {
    /* user choice */
    "editor.wordWrap": "on",
  },
}
`

    expect(
      updateJsonText(content, {
        "[json]": { "editor.defaultFormatter": "oxc.oxc-vscode", "editor.wordWrap": "on" },
        "editor.formatOnSave": true,
        "editor.tabSize": 4,
      })
    ).toBe(`{
  // Editor settings
  "editor.tabSize": 4, // keep four
  "[json]": {
    /* user choice */
    "editor.wordWrap": "on",
    "editor.defaultFormatter": "oxc.oxc-vscode",
  },
  "editor.formatOnSave": true,
}
`)
  })

  it("keep tab indentation and CRLF line endings", () => {
    const content = '{\r\n\t"name": "test",\r\n\t"scripts": {\r\n\t\t"build": "tsc"\r\n\t}\r\n}\r\n'

    expect(
      updateJsonText(content, { name: "test", scripts: { build: "tsc", check: "oxlint" } })
    ).toBe(
      '{\r\n\t"name": "test",\r\n\t"scripts": {\r\n\t\t"build": "tsc",\r\n\t\t"check": "oxlint"\r\n\t}\r\n}\r\n'
    )
  })

  it("replace a changed value and keep its comment", () => {
    const content = `{
    "extends": "base", // the old base
    "strict": true
}
`

    expect(updateJsonText(content, { extends: ["base", "adamantite/typescript"], strict: true }))
      .toBe(`{
    "extends": [
        "base",
        "adamantite/typescript"
    ], // the old base
    "strict": true
}
`)
  })

  it("keep a comment on the last property with that property when it adds a key", () => {
    expect(updateJsonText('{\n  "a": 1 // note on a\n}\n', { a: 1, b: 2 })).toBe(
      '{\n  "a": 1, // note on a\n  "b": 2\n}\n'
    )
  })

  it("keep a comment and a trailing comma on the last property when it adds a key", () => {
    expect(updateJsonText('{\n  "a": 1, // note on a\n}\n', { a: 1, b: 2 })).toBe(
      '{\n  "a": 1, // note on a\n  "b": 2,\n}\n'
    )
  })

  it("change the last of repeated keys, which is the one that parsing keeps", () => {
    expect(
      updateJsonText('{\n  "a": false,\n  "a": false,\n  "b": 1\n}\n', { a: true, b: 1 })
    ).toBe('{\n  "a": true,\n  "b": 1\n}\n')
  })

  it("keep the comments around a repeated key that it removes", () => {
    expect(
      updateJsonText(
        '{\n  "tabSize": 4, // team preference\n  "save": false,\n  // effective setting\n  "save": false\n}\n',
        { save: true, tabSize: 4 }
      )
    ).toBe('{\n  "tabSize": 4, // team preference\n  // effective setting\n  "save": true\n}\n')
  })

  it("keep the comment before the kept key when the removed key comes first", () => {
    expect(
      updateJsonText('{\n  "save": false,\n  // effective setting\n  "save": false\n}\n', {
        save: true,
      })
    ).toBe('{\n  // effective setting\n  "save": true\n}\n')
  })

  it("add a key to the last of repeated objects", () => {
    expect(
      updateJsonText('{\n  "a": { "x": 1 },\n  "a": { "y": 2 }\n}\n', { a: { y: 2, z: 3 } })
    ).toBe('{\n  "a": {\n    "y": 2,\n    "z": 3\n  }\n}\n')
  })

  it("remove a key that the next value does not have", () => {
    expect(updateJsonText('{\n  "a": 1,\n  "b": 2\n}\n', { b: 2 })).toBe('{\n  "b": 2\n}\n')
  })

  it("remove a key that has the name of an Object method", () => {
    expect(updateJsonText('{\n  "toString": false,\n  "a": 1\n}\n', { a: 1 })).toBe(
      '{\n  "a": 1\n}\n'
    )
  })

  it("return the content unchanged when the value does not change", () => {
    const content = '{ "a": [1, 2], /* note */ "b": { "c": null } }'

    expect(updateJsonText(content, { a: [1, 2], b: { c: null } })).toBe(content)
  })

  const plainJson = Schema.MutableJson.check(
    Schema.makeFilter((value) => !someKey(value, (key) => key === "__proto__"))
  )

  it.effect.prop(
    "produce text that parses to the next value",
    { current: plainJson, next: plainJson },
    ({ current, next }) =>
      Effect.gen(function* () {
        const parsed = yield* parseJson(updateJsonText(JSON.stringify(current, null, 2), next))
        // JSON has no negative zero, so compare with the parsed JSON form of `next`.
        const expected = yield* parseJson(JSON.stringify(next))

        expect(parsed).toStrictEqual(expected)
      }),
    { arbitrary: { runs: 300 } }
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
      const files = makeFiles({
        "package.json": JSON.stringify({ name: "test-package" }),
        [file]: content,
      })

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

describe("normalizeDependencyVersion", () => {
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
})
