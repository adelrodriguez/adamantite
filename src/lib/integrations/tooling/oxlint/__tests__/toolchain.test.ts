import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { resolveToolchain } from "#lib/integrations/tooling/oxlint/toolchain.ts"

const ROOT = "/project"
const PLATFORM = `${process.platform}-${process.arch}`
const PLATFORM_PACKAGE = `@effect/tsgo-${PLATFORM}`
const TSGOLINT = process.platform === "win32" ? "tsgolint.exe" : "tsgolint"
const ARTIFACTS = `node_modules/${PLATFORM_PACKAGE}/artifacts`

const STOCK_PACKAGES = {
  "oxlint/package.json": "node_modules/oxlint/package.json",
  "oxlint-tsgolint/package.json": "node_modules/oxlint-tsgolint/package.json",
}

const EFFECT_PACKAGES = {
  ...STOCK_PACKAGES,
  "@effect/tsgo/package.json": "node_modules/@effect/tsgo/package.json",
  [`${PLATFORM_PACKAGE}/package.json`]: `node_modules/${PLATFORM_PACKAGE}/package.json`,
}

function makeManifest(name: string, version: string) {
  return JSON.stringify({ name, version })
}

/**
 * A project with Oxlint `oxlintVersion` and oxlint-tsgolint 7.0.2004 installed, and the Effect
 * builds that @effect/tsgo 0.63.0 ships for Oxlint 1.88.0 and 1.89.0.
 */
function makeFiles(oxlintVersion = "1.88.0") {
  return createFileSystemTestContext({
    files: Object.fromEntries([
      [`${ARTIFACTS}/oxlint-tsgolint/7.0.2004/${TSGOLINT}`, ""],
      [`${ARTIFACTS}/oxlint/1.88.0/oxlint.${PLATFORM}.node`, ""],
      [`${ARTIFACTS}/oxlint/1.89.0/oxlint.${PLATFORM}.node`, ""],
      [`node_modules/${PLATFORM_PACKAGE}/package.json`, makeManifest(PLATFORM_PACKAGE, "0.63.0")],
      ["node_modules/@effect/tsgo/package.json", makeManifest("@effect/tsgo", "0.63.0")],
      ["node_modules/oxlint-tsgolint/package.json", makeManifest("oxlint-tsgolint", "7.0.2004")],
      ["node_modules/oxlint/package.json", makeManifest("oxlint", oxlintVersion)],
      ["package.json", makeManifest("app", "1.0.0")],
    ]),
    root: ROOT,
  })
}

function runResolve(
  files: ReturnType<typeof makeFiles>,
  packages: Readonly<Record<string, string>>
) {
  return resolveToolchain(ROOT).pipe(
    Effect.provide(Layer.mergeAll(files.layer, Path.layer, makeModuleResolverLayer(ROOT, packages)))
  )
}

describe("toolchain", () => {
  it.effect("run Oxlint as it is installed when the project does not install @effect/tsgo", () =>
    Effect.gen(function* () {
      const toolchain = yield* runResolve(makeFiles(), STOCK_PACKAGES)

      expect(toolchain).toStrictEqual({
        backend: { _tag: "Stock" },
        binding: { _tag: "Stock" },
        oxlint: `${ROOT}/node_modules/oxlint`,
      })
    })
  )

  it.effect(
    "replace the binding and the backend with the Effect builds of the installed versions",
    () =>
      Effect.gen(function* () {
        const toolchain = yield* runResolve(makeFiles(), EFFECT_PACKAGES)

        expect(toolchain).toStrictEqual({
          backend: {
            _tag: "Replaced",
            path: `${ROOT}/${ARTIFACTS}/oxlint-tsgolint/7.0.2004/${TSGOLINT}`,
          },
          binding: {
            _tag: "Replaced",
            path: `${ROOT}/${ARTIFACTS}/oxlint/1.88.0/oxlint.${PLATFORM}.node`,
          },
          oxlint: `${ROOT}/node_modules/oxlint`,
        })
      })
  )

  it.effect(
    "name the supported versions when @effect/tsgo has no build of the installed Oxlint",
    () =>
      Effect.gen(function* () {
        const error = yield* runResolve(makeFiles("1.91.0"), EFFECT_PACKAGES).pipe(Effect.flip)

        expect(error).toMatchObject({
          _tag: "EffectBuildMissing",
          effectVersion: "0.63.0",
          supported: ["1.88.0", "1.89.0"],
          tool: "oxlint",
          version: "1.91.0",
        })
        expect(error.message).toBe(
          "The effect preset needs the @effect/tsgo build of oxlint 1.91.0. @effect/tsgo 0.63.0 has builds for oxlint 1.88.0, 1.89.0. Run `adamantite update`."
        )
      })
  )

  it.effect("fail for a platform that @effect/tsgo publishes no build for", () =>
    Effect.gen(function* () {
      const packages = Object.fromEntries(
        Object.entries(EFFECT_PACKAGES).filter(
          ([specifier]) => specifier !== `${PLATFORM_PACKAGE}/package.json`
        )
      )

      const error = yield* runResolve(makeFiles(), packages).pipe(Effect.flip)

      expect(error).toMatchObject({ _tag: "EffectPlatformUnsupported", platform: PLATFORM })
    })
  )

  it.effect("fail when the project does not install Oxlint", () =>
    Effect.gen(function* () {
      const error = yield* runResolve(makeFiles(), {}).pipe(Effect.flip)

      expect(error).toMatchObject({
        _tag: "PackageNotInstalled",
        packageName: "oxlint",
        project: ROOT,
      })
    })
  )
})
