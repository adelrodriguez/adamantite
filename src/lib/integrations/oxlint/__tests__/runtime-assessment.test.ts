import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
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
const BINDING_SUFFIXES: Partial<Record<NodeJS.Platform, string>> = { linux: "-gnu", win32: "-msvc" }

const STOCK_TARGET = `${process.platform}-${process.arch}${BINDING_SUFFIXES[process.platform] ?? ""}`

const STOCK_BINDING = `node_modules/oxlint/dist/oxlint.${STOCK_TARGET}.node`

const STOCK_TSRS_PACKAGE = `@tsrs/${process.platform}-${process.arch}${process.platform === "linux" ? "-gnu" : ""}`

const STOCK_BACKEND = `node_modules/${STOCK_TSRS_PACKAGE}/${TSRS}`

const STOCK_PACKAGES = {
  "oxlint/package.json": "node_modules/oxlint/package.json",
  "tsrs/package.json": "node_modules/tsrs/package.json",
  [`${STOCK_TSRS_PACKAGE}/package.json`]: `node_modules/${STOCK_TSRS_PACKAGE}/package.json`,
}

// The Effect bridge swaps the binding of the installed binding package, so an Effect project needs
// that package too.
const STOCK_BINDING_PACKAGE = `@oxlint/binding-${STOCK_TARGET}`

const STOCK_BINDING_PACKAGE_FILE = `node_modules/${STOCK_BINDING_PACKAGE}/oxlint.node`

const PACKAGES = {
  "@effect/tsgo/oxlint-bridge": "node_modules/@effect/tsgo/lib/oxlint-bridge.cjs",
  "@effect/tsgo/package.json": "node_modules/@effect/tsgo/package.json",
  [STOCK_BINDING_PACKAGE]: STOCK_BINDING_PACKAGE_FILE,
  [`${PLATFORM_PACKAGE}/package.json`]: `node_modules/${PLATFORM_PACKAGE}/package.json`,
  "oxlint/package.json": "node_modules/oxlint/package.json",
  "tsrs/package.json": "node_modules/tsrs/package.json",
}

function makeFiles(overrides: Record<string, string> = {}) {
  return createFileSystemTestContext({
    files: {
      [`${ARTIFACTS}/oxlint/1.91.0/oxlint.node`]: "",
      [`${ARTIFACTS}/tsrs/${TSRS_VERSION}/${TSRS}`]: "",
      [STOCK_BINDING_PACKAGE_FILE]: "",
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

function makeStockFiles(nativeFiles: Record<string, string>) {
  return makeFiles({
    "/usr/bin/ldd": "GNU libc",
    "node_modules/.bin/tsrs-lint": "",
    "node_modules/.bin/tsrs-lint.cmd": "",
    [`node_modules/${STOCK_TSRS_PACKAGE}/package.json`]: "{}",
    "package.json": JSON.stringify({
      devDependencies: { oxlint: oxlint.version, tsrs: TSRS_VERSION },
      scripts: { check: "adamantite check" },
    }),
    ...nativeFiles,
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
  it.effect("report a missing stock native binding although the parent packages resolve", () =>
    Effect.gen(function* () {
      const result = yield* runAssess(makeStockFiles({ [STOCK_BACKEND]: "" }), STOCK_PACKAGES)

      expect(result.findings).toStrictEqual([
        unavailable(
          "Oxlint cannot resolve its installed native binding.",
          "Install the target project's optional dependencies for this platform, or restore its local binding."
        ),
      ])
    })
  )

  it.effect("report a missing stock tsrs binary although the launcher exists", () =>
    Effect.gen(function* () {
      const result = yield* runAssess(makeStockFiles({ [STOCK_BINDING]: "" }), STOCK_PACKAGES)

      expect(result.findings).toStrictEqual([
        unavailable(
          "Oxlint cannot resolve the installed tsrs binary or its launcher.",
          "Install the target project's optional dependencies for this platform, or restore TSRS_BINARY."
        ),
      ])
    })
  )

  it.effect("accept stock native files without changing files or process variables", () =>
    Effect.gen(function* () {
      const files = makeStockFiles({ [STOCK_BACKEND]: "", [STOCK_BINDING]: "" })
      const before = files.list().map((file) => [file, files.read(file)])
      const environment = { ...process.env }
      files.makeReadOnly(ROOT)

      const result = yield* runAssess(files, STOCK_PACKAGES)

      expect(result).toMatchObject({ findings: [] })
      expect(files.list().map((file) => [file, files.read(file)])).toStrictEqual(before)
      expect({ ...process.env }).toStrictEqual(environment)
    })
  )

  it.effect("accept the installed platform binding without a local binding", () =>
    Effect.gen(function* () {
      const native = `@oxlint/binding-${STOCK_TARGET}`
      const file = `node_modules/${native}/oxlint.node`

      const result = yield* runAssess(makeStockFiles({ [STOCK_BACKEND]: "", [file]: "" }), {
        ...STOCK_PACKAGES,
        [native]: file,
      })

      expect(result).toMatchObject({ findings: [] })
    })
  )

  it.effect.each([
    { binding: "linux-x64-gnu", ldd: "GNU libc", platform: "linux", tsrs: "linux-x64-gnu" },
    { binding: "linux-x64-musl", ldd: "musl libc", platform: "linux", tsrs: "linux-x64-musl" },
    { binding: "win32-x64-msvc", ldd: "", platform: "win32", tsrs: "win32-x64" },
    { binding: "darwin-universal", ldd: "", platform: "darwin", tsrs: "darwin-x64" },
  ] as const)("accept the stock $binding binding and tsrs files", (target) =>
    Effect.gen(function* () {
      const platform = process.platform
      const arch = process.arch
      const nativePackage = `@tsrs/${target.tsrs}`

      const files = makeStockFiles({
        "/usr/bin/ldd": target.ldd,
        [`node_modules/${nativePackage}/tsrs${target.platform === "win32" ? ".exe" : ""}`]: "",
        [`node_modules/oxlint/dist/oxlint.${target.binding}.node`]: "",
      })

      const result = yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          Object.defineProperty(process, "platform", { value: target.platform })
          Object.defineProperty(process, "arch", { value: "x64" })
        }),
        () =>
          runAssess(files, {
            ...STOCK_PACKAGES,
            [`${nativePackage}/package.json`]: `node_modules/${nativePackage}/package.json`,
          }),
        () =>
          Effect.sync(() => {
            Object.defineProperty(process, "platform", { value: platform })
            Object.defineProperty(process, "arch", { value: arch })
          })
      )

      expect(result).toMatchObject({ findings: [] })
    })
  )

  it.effect("accept explicit native binding and tsrs binary overrides", () =>
    Effect.gen(function* () {
      const result = yield* runAssess(
        makeStockFiles({ "custom-tsrs": "", "node_modules/oxlint/dist/custom.node": "" }),
        STOCK_PACKAGES
      ).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({
            NAPI_RS_NATIVE_LIBRARY_PATH: "./custom.node",
            TSRS_BINARY: `${ROOT}/custom-tsrs`,
          })
        )
      )

      expect(result).toMatchObject({ findings: [] })
    })
  )

  it.effect("report an absent TSRS_BINARY override even when the stock binary exists", () =>
    Effect.gen(function* () {
      const result = yield* runAssess(
        makeStockFiles({ [STOCK_BACKEND]: "", [STOCK_BINDING]: "" }),
        STOCK_PACKAGES
      ).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({
            TSRS_BINARY: `${ROOT}/absent-tsrs`,
          })
        )
      )

      expect(result.findings).toStrictEqual([
        unavailable(
          "Oxlint cannot resolve the installed tsrs binary or its launcher.",
          "Install the target project's optional dependencies for this platform, or restore TSRS_BINARY."
        ),
      ])
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

  it.effect("report a missing binding package that the Effect build replaces", () =>
    Effect.gen(function* () {
      const { [STOCK_BINDING_PACKAGE]: _binding, ...packages } = PACKAGES
      const result = yield* runAssess(makeFiles(), packages)

      expect(result.findings).toStrictEqual([
        unavailable(
          "Oxlint cannot resolve its installed native binding.",
          "Install the target project's optional dependencies for this platform, or restore its local binding."
        ),
      ])
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
