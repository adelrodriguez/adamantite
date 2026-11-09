import process from "node:process"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import type { Finding } from "#lib/integrations/base.ts"
import type { Project } from "#lib/workspace/project.ts"
import { oxlintPlugins } from "#lib/integrations/tooling/oxlint/plugins/index.ts"
import {
  resolveOxlintRuntime,
  type OxlintRuntime,
} from "#lib/integrations/tooling/oxlint/runtime.ts"
import { PackageNotInstalled } from "#lib/shared/errors.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"
import { ModuleResolver, resolvePackageDirectory } from "#lib/workspace/module-resolver.ts"

const decodeReport = Schema.decodeUnknownOption(
  Schema.Struct({
    header: Schema.Struct({ glibcVersionRuntime: Schema.optional(Schema.String) }),
    sharedObjects: Schema.Array(Schema.String),
  })
)

function finding(currentState: string, goal: readonly string[]): readonly Finding[] {
  return [
    {
      currentState,
      goal,
      id: "unavailable-oxlint-runtime",
      integration: "oxlint",
      notes: ["Verification: run `adamantite check --only lint` after the repair."],
      title: "Oxlint runtime unavailable",
    },
  ]
}

/**
 * The findings for an Oxlint runtime that the installed packages cannot supply. The entry resolves
 * the same runtime before it loads Oxlint. Package assessment reports a package that `package.json`
 * does not declare, so this assessment skips it.
 */
export const assessOxlintRuntime = Effect.fn("assessOxlintRuntime")(function* (project: Project) {
  const declared = (name: string) =>
    project.packageJson.devDependencies?.[name] ?? project.packageJson.dependencies?.[name]

  if (!declared("oxlint")) {
    return [] satisfies readonly Finding[]
  }

  return yield* Effect.gen(function* () {
    const runtime: OxlintRuntime = yield* resolveOxlintRuntime(project.cwd)

    const { backend, binding } = runtime

    if (declared("tsrs") && backend._tag === "None") {
      return finding("Oxlint cannot resolve the declared tsrs backend or its launcher.", [
        "Install the target project's dependencies so that the tsrs-lint launcher is available.",
      ])
    }

    for (const plugin of oxlintPlugins) {
      if (plugin.runtime._tag === "Native" && declared(plugin.name)) {
        const installed = yield* resolvePackageDirectory(project.cwd, plugin.name)

        if (Option.isNone(installed)) {
          return yield* new PackageNotInstalled({ packageName: plugin.name, project: project.cwd })
        }
      }
    }

    // A plugin that replaces the binding and the backend checks its own builds.
    if (binding._tag === "Replaced" && backend._tag !== "Tsrs") {
      return []
    }

    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const resolver = yield* ModuleResolver
    const platform = `${process.platform}-${process.arch}`
    let libc = "gnu"

    // Follow the pinned loaders' filesystem/report probes, without their child-process fallback.
    if (process.platform === "linux") {
      const ldd = yield* readFileIfExists("/usr/bin/ldd")
      const report = Option.isNone(ldd) ? decodeReport(process.report.getReport()) : Option.none()
      const musl = Option.isSome(ldd)
        ? ldd.value.includes("musl")
        : Option.isSome(report)
          && !report.value.header.glibcVersionRuntime
          && report.value.sharedObjects.some(
            (file) => file.includes("libc.musl-") || file.includes("ld-musl-")
          )
      libc = musl ? "musl" : "gnu"
    }

    const suffix: Partial<Record<NodeJS.Platform, string>> = {
      android: process.arch === "arm" ? "-eabi" : "",
      linux: `-${libc}${process.arch === "arm" ? "eabihf" : ""}`,
      win32:
        process.arch === "x64"
        && (("shlib_suffix" in process.config.variables
          && process.config.variables.shlib_suffix === "dll.a")
          || ("node_target_type" in process.config.variables
            && process.config.variables.node_target_type === "shared_library"))
          ? "-gnu"
          : "-msvc",
    }
    const bindingTarget = platform + (suffix[process.platform] ?? "")

    if (binding._tag === "Stock") {
      const override = yield* Config.String("NAPI_RS_NATIVE_LIBRARY_PATH").pipe(
        Config.withDefault("")
      )
      const targets =
        process.platform === "darwin" ? ["darwin-universal", bindingTarget] : [bindingTarget]
      const nativeCandidates = override
        ? [override]
        : targets.flatMap((target) => [`./oxlint.${target}.node`, `@oxlint/binding-${target}`])
      const candidates = [...nativeCandidates, "./oxlint.wasi.cjs", "@oxlint/binding-wasm32-wasi"]
      const binding = yield* Effect.findFirst(candidates, (specifier) =>
        Effect.gen(function* () {
          const resolved = yield* resolver.resolve(
            path.join(runtime.oxlint, "dist", "bindings.js"),
            specifier
          )
          if (Option.isNone(resolved) || !(yield* fs.exists(resolved.value))) {
            return false
          }

          return (
            specifier !== "./oxlint.wasi.cjs"
            || (yield* fs.exists(path.join(runtime.oxlint, "dist", "oxlint.wasm32-wasi.wasm")))
            || (yield* fs.exists(
              path.join(runtime.oxlint, "dist", "oxlint.wasm32-wasi.debug.wasm")
            ))
          )
        })
      )

      if (Option.isNone(binding)) {
        return finding("Oxlint cannot resolve its installed native binding.", [
          "Install the target project's optional dependencies for this platform, or restore its local binding.",
        ])
      }
    }

    if (backend._tag === "Tsrs") {
      const tsrs = yield* resolvePackageDirectory(project.cwd, "tsrs")
      const override = yield* Config.String("TSRS_BINARY").pipe(Config.withDefault(""))
      const target = `${platform}${process.platform === "linux" ? `-${libc}` : ""}`
      const installed =
        Option.isSome(tsrs) && !override
          ? yield* resolvePackageDirectory(tsrs.value, `@tsrs/${target}`)
          : Option.none<string>()
      const binary =
        override === ""
          ? Option.isSome(installed)
            ? path.join(installed.value, process.platform === "win32" ? "tsrs.exe" : "tsrs")
            : undefined
          : override

      if (
        !(yield* fs.exists(backend.launcher))
        || binary === undefined
        || !(yield* fs.exists(binary))
      ) {
        return finding("Oxlint cannot resolve the installed tsrs binary or its launcher.", [
          "Install the target project's optional dependencies for this platform, or restore TSRS_BINARY.",
        ])
      }
    }

    return []
  }).pipe(
    Effect.catchTags({
      EffectBuildMissing: (error) =>
        Effect.succeed(
          finding(error.message, [
            "Run `adamantite update` to align Oxlint, tsrs, and @effect/tsgo with supported builds.",
          ])
        ),
      EffectPlatformUnsupported: (error) =>
        Effect.succeed(
          finding(error.message, [
            "Lint on a platform that `@effect/tsgo` has builds for, or remove `@effect/tsgo` and the effect preset.",
          ])
        ),
      NativeRuntimeConflict: (error) =>
        Effect.succeed(
          finding(error.message, [
            "Install at most one Oxlint plugin that replaces each native part of the Oxlint runtime.",
          ])
        ),
      PackageNotInstalled: (error) =>
        Effect.succeed(
          declared(error.packageName)
            ? finding(error.message, [
                "Install the target project's dependencies, then run Doctor again.",
              ])
            : []
        ),
    })
  )
})
