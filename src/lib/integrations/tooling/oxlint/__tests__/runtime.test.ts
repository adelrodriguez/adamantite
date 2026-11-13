import process from "node:process"
import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import {
  BackendOverride,
  BindingOverride,
  defineOxlintPlugin,
  JavaScriptRuntime,
  type NativeOverride,
  NativeRuntime,
  type OxlintPlugin,
} from "#lib/integrations/tooling/oxlint/plugins/base.ts"
import {
  NoBackend,
  ReplacedBackend,
  ReplacedPart,
  resolveOxlintRuntime,
  StockPart,
  toBackendEnv,
  TsrsBackend,
  type OxlintRuntime,
  type RuntimePart,
} from "#lib/integrations/tooling/oxlint/runtime.ts"
import {
  EffectBuildMissing,
  EffectPlatformUnsupported,
  NativeRuntimeConflict,
  PackageNotInstalled,
} from "#lib/shared/errors.ts"

const ROOT = "/project"
const PLATFORM = `${process.platform}-${process.arch}`
const PLATFORM_PACKAGE = `@effect/tsgo-${PLATFORM}`
const TSRS = process.platform === "win32" ? "tsrs.exe" : "tsrs"
const TSRS_VERSION = "0.21.0-ts7.1.0-beta"
const ARTIFACTS = `node_modules/${PLATFORM_PACKAGE}/artifacts`

const STOCK_PACKAGES = {
  "oxlint/package.json": "node_modules/oxlint/package.json",
  "tsrs/package.json": "node_modules/tsrs/package.json",
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
 * A project with Oxlint `oxlintVersion` and tsrs `tsrsVersion` installed, and Effect builds for
 * Oxlint 1.88.0 and 1.89.0 and tsrs 0.21.0-ts7.1.0-beta, in the layout of @effect/tsgo 0.67.1.
 */
function makeFiles(oxlintVersion = "1.88.0", tsrsVersion = TSRS_VERSION) {
  return createFileSystemTestContext({
    files: Object.fromEntries([
      [`${ARTIFACTS}/tsrs/${TSRS_VERSION}/${TSRS}`, ""],
      [`${ARTIFACTS}/tsrs/${TSRS_VERSION}/lib.d.ts`, ""],
      [`${ARTIFACTS}/oxlint/1.88.0/oxlint.${PLATFORM}.node`, ""],
      [`${ARTIFACTS}/oxlint/1.89.0/oxlint.${PLATFORM}.node`, ""],
      ["node_modules/.bin/tsrs-lint", ""],
      ["node_modules/.bin/tsrs-lint.cmd", ""],
      [`node_modules/${PLATFORM_PACKAGE}/package.json`, makeManifest(PLATFORM_PACKAGE, "0.67.1")],
      ["node_modules/@effect/tsgo/package.json", makeManifest("@effect/tsgo", "0.67.1")],
      ["node_modules/tsrs/package.json", makeManifest("tsrs", tsrsVersion)],
      ["node_modules/oxlint/package.json", makeManifest("oxlint", oxlintVersion)],
      ["package.json", makeManifest("app", "1.0.0")],
    ]),
    root: ROOT,
  })
}

function runResolve(
  files: ReturnType<typeof makeFiles>,
  packages: Readonly<Record<string, string>>,
  project = ROOT
) {
  return resolveOxlintRuntime(project).pipe(
    Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT, packages)])
  )
}

/**
 * Run `effect` as Node.js runs it on `platform`, and restore the real platform after it.
 */
function onPlatform<A, E, R>(platform: NodeJS.Platform, effect: Effect.Effect<A, E, R>) {
  const real = process.platform

  return Effect.acquireUseRelease(
    Effect.sync(() => Object.defineProperty(process, "platform", { value: platform })),
    () => effect,
    () => Effect.sync(() => Object.defineProperty(process, "platform", { value: real }))
  )
}

/**
 * A monorepo that installs Oxlint and tsrs at the root, where the package manager writes the
 * `tsrs-lint` bin as `launcher`, and a workspace package at `packages/app`.
 */
function makeWorkspaceFiles(launcher: string) {
  return createFileSystemTestContext({
    files: {
      [`node_modules/.bin/${launcher}`]: "",
      "node_modules/oxlint/package.json": makeManifest("oxlint", "1.91.0"),
      "node_modules/tsrs/package.json": makeManifest("tsrs", TSRS_VERSION),
      "package.json": makeManifest("monorepo", "1.0.0"),
      "packages/app/package.json": makeManifest("app", "1.0.0"),
    },
    root: ROOT,
  })
}

describe("Oxlint runtime", () => {
  it.effect("start the installed tsrs when the project does not install @effect/tsgo", () =>
    Effect.gen(function* () {
      const runtime = yield* runResolve(makeFiles(), STOCK_PACKAGES)

      expect(runtime).toStrictEqual({
        backend: new TsrsBackend({
          launcher:
            process.platform === "win32"
              ? `${ROOT}/node_modules/.bin/tsrs-lint.cmd`
              : `${ROOT}/node_modules/.bin/tsrs-lint`,
        }),
        binding: new StockPart(),
        oxlint: `${ROOT}/node_modules/oxlint`,
      })
    })
  )

  it.effect("find the tsrs-lint launcher of the root installation for a workspace package", () =>
    Effect.gen(function* () {
      const runtime = yield* onPlatform(
        "linux",
        runResolve(makeWorkspaceFiles("tsrs-lint"), STOCK_PACKAGES, `${ROOT}/packages/app`)
      )

      expect(runtime.backend).toStrictEqual(
        new TsrsBackend({ launcher: `${ROOT}/node_modules/.bin/tsrs-lint` })
      )
    })
  )

  it.effect(
    "start the tsrs-lint launcher of the root installation for a workspace package on Windows",
    () =>
      Effect.gen(function* () {
        const runtime = yield* onPlatform(
          "win32",
          runResolve(makeWorkspaceFiles("tsrs-lint.cmd"), STOCK_PACKAGES, `${ROOT}/packages/app`)
        )

        expect(runtime.backend).toStrictEqual(
          new TsrsBackend({ launcher: `${ROOT}/node_modules/.bin/tsrs-lint.cmd` })
        )
      })
  )

  it.effect("start the .exe launcher that Bun writes for tsrs-lint on Windows", () =>
    Effect.gen(function* () {
      const runtime = yield* onPlatform(
        "win32",
        runResolve(makeWorkspaceFiles("tsrs-lint.exe"), STOCK_PACKAGES)
      )

      expect(runtime.backend).toStrictEqual(
        new TsrsBackend({ launcher: `${ROOT}/node_modules/.bin/tsrs-lint.exe` })
      )
    })
  )

  it.effect("run Oxlint as it is installed when the project does not install tsrs", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "node_modules/oxlint/package.json": makeManifest("oxlint", "1.91.0"),
          "package.json": makeManifest("app", "1.0.0"),
        },
        root: ROOT,
      })

      const runtime = yield* runResolve(files, {
        "oxlint/package.json": "node_modules/oxlint/package.json",
      })

      expect(runtime).toStrictEqual({
        backend: new NoBackend(),
        binding: new StockPart(),
        oxlint: `${ROOT}/node_modules/oxlint`,
      })
    })
  )

  it.effect(
    "replace the binding and the backend with the Effect builds of the installed versions",
    () =>
      Effect.gen(function* () {
        const runtime = yield* runResolve(makeFiles(), EFFECT_PACKAGES)

        expect(runtime).toStrictEqual({
          backend: new ReplacedBackend({
            env: {
              EFFECT_TSGO_TSGOLINT_MODE: "tsrs",
              EFFECT_TSGO_TSGOLINT_PATH: `${ROOT}/${ARTIFACTS}/tsrs/${TSRS_VERSION}/${TSRS}`,
            },
          }),
          binding: new ReplacedPart({
            path: `${ROOT}/${ARTIFACTS}/oxlint/1.88.0/oxlint.${PLATFORM}.node`,
          }),
          oxlint: `${ROOT}/node_modules/oxlint`,
        })
      })
  )

  it.effect(
    "name the supported versions when @effect/tsgo has no build of the installed Oxlint",
    () =>
      Effect.gen(function* () {
        const error = yield* runResolve(makeFiles("1.91.0"), EFFECT_PACKAGES).pipe(Effect.flip)

        expect(error).toBeInstanceOf(EffectBuildMissing)
        expect(error).toMatchObject({
          effectVersion: "0.67.1",
          supported: ["1.88.0", "1.89.0"],
          tool: "oxlint",
          version: "1.91.0",
        })
        expect(error.message).toBe(
          "The effect preset needs the @effect/tsgo build of oxlint 1.91.0. @effect/tsgo 0.67.1 has builds for oxlint 1.88.0, 1.89.0. Run `adamantite update`."
        )
      })
  )

  it.effect("name the backend when @effect/tsgo has no build of either installed version", () =>
    Effect.gen(function* () {
      const error = yield* runResolve(makeFiles("1.91.0", "0.22.0"), EFFECT_PACKAGES).pipe(
        Effect.flip
      )

      expect(error).toBeInstanceOf(EffectBuildMissing)
      expect(error).toMatchObject({
        supported: [TSRS_VERSION],
        tool: "tsrs",
        version: "0.22.0",
      })
    })
  )

  it.effect("say that @effect/tsgo has no builds of tsrs for a platform without them", () =>
    Effect.gen(function* () {
      // @effect/tsgo 0.67.1 ships no tsrs builds for Windows ARM64, because tsrs has no build for
      // it yet.
      const files = createFileSystemTestContext({
        files: {
          [`${ARTIFACTS}/oxlint/1.88.0/oxlint.${PLATFORM}.node`]: "",
          [`node_modules/${PLATFORM_PACKAGE}/package.json`]: makeManifest(
            PLATFORM_PACKAGE,
            "0.67.1"
          ),
          "node_modules/@effect/tsgo/package.json": makeManifest("@effect/tsgo", "0.67.1"),
          "node_modules/oxlint/package.json": makeManifest("oxlint", "1.88.0"),
          "node_modules/tsrs/package.json": makeManifest("tsrs", TSRS_VERSION),
          "package.json": makeManifest("app", "1.0.0"),
        },
        root: ROOT,
      })

      const error = yield* runResolve(files, EFFECT_PACKAGES).pipe(Effect.flip)

      expect(error.message).toBe(
        `The effect preset needs the @effect/tsgo build of tsrs ${TSRS_VERSION}. @effect/tsgo 0.67.1 has no builds of tsrs. Run \`adamantite update\`.`
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

      expect(error).toBeInstanceOf(EffectPlatformUnsupported)
      expect(error).toMatchObject({ platform: PLATFORM })
    })
  )

  it.effect("fail for an Effect project that does not install tsrs", () =>
    Effect.gen(function* () {
      const packages = Object.fromEntries(
        Object.entries(EFFECT_PACKAGES).filter(([specifier]) => specifier !== "tsrs/package.json")
      )

      const error = yield* runResolve(makeFiles(), packages).pipe(Effect.flip)

      expect(error).toBeInstanceOf(PackageNotInstalled)
      expect(error).toMatchObject({ packageName: "tsrs" })
    })
  )

  it.effect("fail when the project does not install Oxlint", () =>
    Effect.gen(function* () {
      const error = yield* runResolve(makeFiles(), {}).pipe(Effect.flip)

      expect(error).toBeInstanceOf(PackageNotInstalled)
      expect(error).toMatchObject({
        packageName: "oxlint",
        project: ROOT,
      })
    })
  )
})

describe("native runtime overrides", () => {
  it.effect.each(["Binding", "Backend"] as const)(
    "reject two extensions that replace the %s",
    (part) =>
      Effect.gen(function* () {
        const files = makeFiles()

        const override: NativeOverride =
          part === "Binding"
            ? new BindingOverride({ path: "/native.node" })
            : new BackendOverride({ env: { NATIVE_BACKEND: "/backend" } })

        const error = yield* resolveOxlintRuntime(ROOT, [
          {
            name: "first",
            runtime: new NativeRuntime({ resolve: () => Effect.succeed([override]) }),
          },
          {
            name: "second",
            runtime: new NativeRuntime({ resolve: () => Effect.succeed([override]) }),
          },
        ]).pipe(
          Effect.flip,
          Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT, STOCK_PACKAGES)])
        )

        expect(error).toBeInstanceOf(NativeRuntimeConflict)
        expect(error).toMatchObject({
          part,
          plugins: ["first", "second"],
        })
      })
  )

  it.effect("combine distinct native parts and replace the whole stock backend", () =>
    Effect.gen(function* () {
      const files = makeFiles()

      const runtime = yield* resolveOxlintRuntime(ROOT, [
        {
          name: "binding",
          runtime: new NativeRuntime({
            resolve: () => Effect.succeed([new BindingOverride({ path: "/binding.node" })]),
          }),
        },
        {
          name: "backend",
          runtime: new NativeRuntime({
            resolve: () =>
              Effect.succeed([new BackendOverride({ env: { NATIVE_BACKEND: "/backend" } })]),
          }),
        },
        { name: "javascript", runtime: new JavaScriptRuntime() },
      ]).pipe(
        Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT, STOCK_PACKAGES)])
      )

      expect(runtime).toStrictEqual({
        backend: new ReplacedBackend({ env: { NATIVE_BACKEND: "/backend" } }),
        binding: new ReplacedPart({ path: "/binding.node" }),
        oxlint: "/project/node_modules/oxlint",
      })
    })
  )
})

describe("toBackendEnv", () => {
  it.each([
    { backend: new NoBackend(), env: {} },
    { backend: new TsrsBackend({ launcher: "/tsrs-lint" }), env: {} },
    {
      backend: new ReplacedBackend({ env: { NATIVE_BACKEND: "/backend" } }),
      env: { NATIVE_BACKEND: "/backend" },
    },
  ])("give the variables that start the $backend._tag backend", ({ backend, env }) => {
    expect(toBackendEnv(backend, "linux")).toStrictEqual(env)
  })

  // Oxlint 1.92 and later find the launcher themselves, but no Windows run has confirmed it.
  it("name the tsrs-lint launcher on Windows", () => {
    expect(toBackendEnv(new TsrsBackend({ launcher: "C:/tsrs-lint.cmd" }), "win32")).toStrictEqual({
      OXLINT_TSGOLINT_PATH: "C:/tsrs-lint.cmd",
    })
  })
})

describe("runtime types", () => {
  it("keep plugin capabilities and resolved runtime parts distinct in types", () => {
    const javascript = defineOxlintPlugin({
      name: "example",
      runtime: new JavaScriptRuntime(),
    })

    expectTypeOf(javascript.name).toEqualTypeOf<"example">()
    expectTypeOf<OxlintPlugin["runtime"]>().toEqualTypeOf<JavaScriptRuntime | NativeRuntime>()
    expectTypeOf<NativeOverride>().toEqualTypeOf<BindingOverride | BackendOverride>()
    expectTypeOf<OxlintRuntime["binding"]>().toEqualTypeOf<RuntimePart>()
  })
})
