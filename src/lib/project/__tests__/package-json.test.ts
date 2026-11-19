import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import {
  CI_SCRIPTS,
  matchDeclaredVersion,
  parseDependencySpecifier,
  readPackageJson,
  SCRIPT_ORDER,
  type Script,
} from "#lib/project/package-json.ts"
import { FailedToParseFile, FailedToReadFile, InvalidPackageJson } from "#lib/shared/errors.ts"
import { stringifyJson } from "#lib/shared/json.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([files.layer, Path.layer])
}

describe("managed scripts", () => {
  it("order every managed script, and run the CI scripts in that order", () => {
    expectTypeOf<(typeof SCRIPT_ORDER)[number]>().toEqualTypeOf<Script>()
    expect(SCRIPT_ORDER).toStrictEqual(["check", "fix", "analyze"])
    expect(CI_SCRIPTS).toStrictEqual(["check", "analyze"])
  })
})

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

function describeSpecifier(specifier: string) {
  return matchDeclaredVersion(parseDependencySpecifier(specifier), {
    Catalog: ({ catalog }) => `catalog ${catalog}`,
    Unreadable: () => "unreadable",
    Version: ({ version }) => `version ${version}`,
  })
}

describe("parseDependencySpecifier", () => {
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
