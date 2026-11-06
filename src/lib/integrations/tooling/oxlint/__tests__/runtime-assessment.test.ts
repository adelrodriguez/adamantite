import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { assessOxlintRuntime } from "#lib/integrations/tooling/oxlint/runtime-assessment.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"
const PLATFORM_PACKAGE = `@effect/tsgo-${process.platform}-${process.arch}`
const TSRS_VERSION = "0.21.0-ts7.1.0-beta"
const TSRS = process.platform === "win32" ? "tsrs.exe" : "tsrs"
const ARTIFACTS = `node_modules/${PLATFORM_PACKAGE}/artifacts`
const PACKAGES = {
  "@effect/tsgo/package.json": "node_modules/@effect/tsgo/package.json",
  [`${PLATFORM_PACKAGE}/package.json`]: `node_modules/${PLATFORM_PACKAGE}/package.json`,
  "oxlint/package.json": "node_modules/oxlint/package.json",
  "tsrs/package.json": "node_modules/tsrs/package.json",
}

function makeFiles(overrides: Record<string, string> = {}) {
  return createFileSystemTestContext({
    files: {
      [`${ARTIFACTS}/oxlint/1.91.0/oxlint.node`]: "",
      [`${ARTIFACTS}/tsrs/${TSRS_VERSION}/${TSRS}`]: "",
      [`node_modules/${PLATFORM_PACKAGE}/package.json`]: JSON.stringify({ version: "0.67.1" }),
      "node_modules/@effect/tsgo/package.json": JSON.stringify({ version: "0.67.1" }),
      "node_modules/oxlint/package.json": JSON.stringify({ version: "1.91.0" }),
      "node_modules/tsrs/package.json": JSON.stringify({ version: TSRS_VERSION }),
      "oxlint.config.ts": toOxlintTsConfigContent(),
      "package.json": JSON.stringify({
        devDependencies: { "@effect/tsgo": "0.67.1", oxlint: oxlint.version, tsrs: TSRS_VERSION },
        scripts: { check: "adamantite check" },
      }),
      ...overrides,
    },
    root: ROOT,
  })
}

function runAssess(
  files: ReturnType<typeof makeFiles>,
  packages: Readonly<Record<string, string>> = PACKAGES
) {
  return readProject(ROOT).pipe(
    Effect.flatMap((project) => oxlint.assess(project)),
    Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT, packages)])
  )
}

describe("Oxlint runtime assessment", () => {
  it.effect("accept a supported native runtime without changing files or process variables", () =>
    Effect.gen(function* () {
      const files = makeFiles()
      const before = files.list().map((file) => [file, files.read(file)])
      const environment = { ...process.env }
      files.makeReadOnly(ROOT)

      const result = yield* runAssess(files)

      expect(result).toMatchObject({ applicable: true, findings: [] })
      expect(files.list().map((file) => [file, files.read(file)])).toStrictEqual(before)
      expect({ ...process.env }).toStrictEqual(environment)
    })
  )

  it.effect("report an unsupported native build through the Oxlint integration", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "node_modules/oxlint/package.json": '{"version":"2.0.0"}',
      })
      const result = yield* runAssess(files)

      expect(result.applicable && result.findings).toContainEqual(
        expect.objectContaining({
          currentState: expect.stringContaining("build of oxlint 2.0.0"),
          id: "unavailable-oxlint-runtime",
        })
      )
    })
  )

  it.effect("report a declared package that is absent from the installed project", () =>
    Effect.gen(function* () {
      const result = yield* runAssess(makeFiles(), {})

      expect(result.applicable && result.findings).toContainEqual(
        expect.objectContaining({
          currentState: expect.stringContaining("`oxlint` is not installed"),
          id: "unavailable-oxlint-runtime",
        })
      )
    })
  )

  it.effect("report a missing stock backend when tsrs is declared", () =>
    Effect.gen(function* () {
      const result = yield* runAssess(makeFiles(), {
        "oxlint/package.json": PACKAGES["oxlint/package.json"],
      })

      expect(result.applicable && result.findings).toContainEqual(
        expect.objectContaining({
          currentState: "Oxlint cannot resolve the declared tsrs backend or its launcher.",
          id: "unavailable-oxlint-runtime",
        })
      )
    })
  )

  it.effect("report a declared native plugin that is absent from the installed project", () =>
    Effect.gen(function* () {
      const result = yield* runAssess(
        makeFiles({
          "node_modules/.bin/tsrs-lint.cmd": "",
          "oxlint.config.ts": toOxlintTsConfigContent(["effect"]),
        }),
        {
          "oxlint/package.json": PACKAGES["oxlint/package.json"],
          "tsrs/package.json": PACKAGES["tsrs/package.json"],
        }
      )

      expect(result.applicable && result.findings).toContainEqual(
        expect.objectContaining({
          currentState: expect.stringContaining("`@effect/tsgo` is not installed"),
          id: "unavailable-oxlint-runtime",
        })
      )
    })
  )

  it.effect("report an unsupported native platform", () =>
    Effect.gen(function* () {
      const result = yield* runAssess(makeFiles(), {
        "@effect/tsgo/package.json": PACKAGES["@effect/tsgo/package.json"],
        "oxlint/package.json": PACKAGES["oxlint/package.json"],
      })

      expect(result.applicable && result.findings).toContainEqual(
        expect.objectContaining({
          currentState: expect.stringContaining("has no Effect build of Oxlint"),
          id: "unavailable-oxlint-runtime",
        })
      )
    })
  )

  it.effect("leave an undeclared package to package assessment", () =>
    Effect.gen(function* () {
      const files = makeFiles({ "package.json": "{}" })
      const findings = yield* readProject(ROOT).pipe(
        Effect.flatMap((project) => assessOxlintRuntime(project)),
        Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT, {})])
      )

      expect(findings).toStrictEqual([])
    })
  )

  it.effect("propagate a malformed installed manifest instead of hiding the failure", () =>
    Effect.gen(function* () {
      const error = yield* runAssess(
        makeFiles({
          "node_modules/oxlint/package.json": "not JSON",
        })
      ).pipe(Effect.flip)

      expect(error).toMatchObject({ _tag: "FailedToParseFile" })
    })
  )
})
