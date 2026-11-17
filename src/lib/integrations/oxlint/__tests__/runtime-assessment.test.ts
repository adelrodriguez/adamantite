import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { withConfigLoader } from "#__tests__/config-loader.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { makeOxlintFilesLayer } from "#__tests__/oxlint-files.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/oxlint/config.ts"
import { PACKAGE as oxlint } from "#lib/integrations/oxlint/index.ts"
import { assessOxlintRuntime } from "#lib/integrations/oxlint/runtime-assessment.ts"
import * as Project from "#lib/project/index.ts"
import { FailedToParseFile } from "#lib/shared/errors.ts"

const ROOT = "/project"
const PLATFORM_PACKAGE = `@effect/tsgo-${process.platform}-${process.arch}`
const TSRS_VERSION = "0.21.0-ts7.1.0-beta"
const TSRS = process.platform === "win32" ? "tsrs.exe" : "tsrs"
const ARTIFACTS = `node_modules/${PLATFORM_PACKAGE}/artifacts`

const STOCK_PACKAGES = {
  "oxlint/package.json": "node_modules/oxlint/package.json",
  "tsrs/package.json": "node_modules/tsrs/package.json",
}

const PACKAGES = {
  "@effect/tsgo/oxlint-bridge": "node_modules/@effect/tsgo/lib/oxlint-bridge.cjs",
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
      "oxlint.config.ts": toOxlintTsConfigContent([]),
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
  return Project.read().pipe(
    Effect.flatMap(assessOxlintRuntime),
    Effect.map((findings) => ({ findings })),
    Effect.provideService(Project.Directory, ROOT),
    Effect.provide(
      withConfigLoader(
        Layer.mergeAll(
          files.layer,
          makeOxlintFilesLayer(),
          Path.layer,
          makeModuleResolverLayer(ROOT, packages)
        )
      )
    )
  )
}

/**
 * A project with Oxlint and tsrs and no native plugin.
 */
function makeStockFiles() {
  return makeFiles({
    "node_modules/.bin/tsrs-lint": "",
    "node_modules/.bin/tsrs-lint.cmd": "",
    "package.json": JSON.stringify({
      devDependencies: { oxlint: oxlint.version, tsrs: TSRS_VERSION },
      scripts: { check: "adamantite check" },
    }),
  })
}

/**
 * The finding of an Oxlint runtime that cannot run, with its one repair step.
 */
function unavailable(currentState: string, goal: string) {
  return {
    currentState,
    goal: [goal],
    id: "unavailable-oxlint-runtime",
    integration: "oxlint",
    notes: ["Verification: run `adamantite check --only lint` after the repair."],
    title: "Oxlint runtime unavailable",
  }
}

describe("Oxlint runtime assessment", () => {
  // Oxlint's binding loader and the tsrs launcher name a missing platform package themselves, so
  // the assessment does not predict which one they load.
  it.effect("accept a stock runtime without changing files or process variables", () =>
    Effect.gen(function* () {
      const files = makeStockFiles()
      const before = files.list().map((file) => [file, files.read(file)])
      const environment = { ...process.env }
      files.makeReadOnly(ROOT)

      const result = yield* runAssess(files, STOCK_PACKAGES)

      expect(result).toMatchObject({ findings: [] })
      expect(files.list().map((file) => [file, files.read(file)])).toStrictEqual(before)
      expect({ ...process.env }).toStrictEqual(environment)
    })
  )

  it.effect("accept a supported native runtime without changing files or process variables", () =>
    Effect.gen(function* () {
      const files = makeFiles()
      const before = files.list().map((file) => [file, files.read(file)])
      const environment = { ...process.env }
      files.makeReadOnly(ROOT)

      const result = yield* runAssess(files)

      expect(result).toMatchObject({ findings: [] })
      expect(files.list().map((file) => [file, files.read(file)])).toStrictEqual(before)
      expect({ ...process.env }).toStrictEqual(environment)
    })
  )

  it.effect("report an @effect/tsgo without the Oxlint bridge", () =>
    Effect.gen(function* () {
      const { "@effect/tsgo/oxlint-bridge": _bridge, ...packages } = PACKAGES
      const result = yield* runAssess(makeFiles(), packages)

      expect(result.findings).toStrictEqual([
        unavailable(
          "The effect preset needs `@effect/tsgo/oxlint-bridge`, which @effect/tsgo 0.67.1 does not ship. Run `adamantite update`.",
          "Run `adamantite update` to align Oxlint, tsrs, and @effect/tsgo with supported builds."
        ),
      ])
    })
  )

  it.effect("report an unsupported native build through the Oxlint integration", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "node_modules/oxlint/package.json": '{"version":"2.0.0"}',
      })

      const result = yield* runAssess(files)

      expect(result.findings).toStrictEqual([
        unavailable(
          "The effect preset needs the @effect/tsgo build of oxlint 2.0.0. @effect/tsgo 0.67.1 has builds for oxlint 1.91.0. Run `adamantite update`.",
          "Run `adamantite update` to align Oxlint, tsrs, and @effect/tsgo with supported builds."
        ),
      ])
    })
  )

  it.effect("report a declared package that is absent from the installed project", () =>
    Effect.gen(function* () {
      const result = yield* runAssess(makeFiles(), {})

      expect(result.findings).toStrictEqual([
        unavailable(
          `\`oxlint\` is not installed in \`${ROOT}\`. Install the dependencies, or run \`adamantite update\`.`,
          "Install the target project's dependencies, then run Doctor again."
        ),
      ])
    })
  )

  it.effect("report a missing stock backend when tsrs is declared", () =>
    Effect.gen(function* () {
      const result = yield* runAssess(makeFiles(), {
        "oxlint/package.json": PACKAGES["oxlint/package.json"],
      })

      expect(result.findings).toStrictEqual([
        unavailable(
          "Oxlint cannot resolve the declared tsrs backend or its launcher.",
          "Install the target project's dependencies so that the tsrs-lint launcher is available."
        ),
      ])
    })
  )

  it.effect("report a declared native plugin that is absent from the installed project", () =>
    Effect.gen(function* () {
      const result = yield* runAssess(
        makeFiles({
          "node_modules/.bin/tsrs-lint": "",
          "node_modules/.bin/tsrs-lint.cmd": "",
          "oxlint.config.ts": toOxlintTsConfigContent(["effect"]),
        }),
        {
          "oxlint/package.json": PACKAGES["oxlint/package.json"],
          "tsrs/package.json": PACKAGES["tsrs/package.json"],
        }
      )

      expect(result.findings).toStrictEqual([
        unavailable(
          `\`@effect/tsgo\` is not installed in \`${ROOT}\`. Install the dependencies, or run \`adamantite update\`.`,
          "Install the target project's dependencies, then run Doctor again."
        ),
      ])
    })
  )

  it.effect("report an unsupported native platform", () =>
    Effect.gen(function* () {
      const result = yield* runAssess(makeFiles(), {
        "@effect/tsgo/package.json": PACKAGES["@effect/tsgo/package.json"],
        "oxlint/package.json": PACKAGES["oxlint/package.json"],
      })

      expect(result.findings).toStrictEqual([
        unavailable(
          `@effect/tsgo has no Effect build of Oxlint for ${process.platform}-${process.arch}, so Oxlint cannot load the effect preset here.`,
          "Lint on a platform that `@effect/tsgo` has builds for, or remove `@effect/tsgo` and the effect preset."
        ),
      ])
    })
  )

  it.effect("leave an undeclared package to package assessment", () =>
    Effect.gen(function* () {
      const files = makeFiles({ "package.json": "{}" })

      const findings = yield* Project.read().pipe(
        Effect.flatMap((project) => assessOxlintRuntime(project)),
        Effect.provideService(Project.Directory, ROOT),
        Effect.provide(
          withConfigLoader(
            Layer.mergeAll(
              files.layer,
              makeOxlintFilesLayer(),
              Path.layer,
              makeModuleResolverLayer(ROOT, {})
            )
          )
        )
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

      expect(error).toBeInstanceOf(FailedToParseFile)
    })
  )
})
