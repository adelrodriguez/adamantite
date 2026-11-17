import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { Finding } from "#lib/integrations/base.ts"
import { NativeRuntime } from "#lib/integrations/oxlint/plugins/base.ts"
import { oxlintPlugins } from "#lib/integrations/oxlint/plugins/index.ts"
import { NoBackend, resolveOxlintRuntime } from "#lib/integrations/oxlint/runtime.ts"
import * as Project from "#lib/project/index.ts"
import { resolvePackageDirectory } from "#lib/project/module-resolver.ts"
import { PackageNotInstalled } from "#lib/shared/errors.ts"

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
 * The findings for an Oxlint runtime that the installed packages cannot supply, from the resolver
 * that the entry runs before it loads Oxlint. Package assessment reports a package that
 * `package.json` does not declare, so this assessment skips it. It does not predict which platform
 * binding Oxlint or tsrs loads, because their loaders name a missing platform package when the
 * check runs.
 */
export const assessOxlintRuntime = Effect.fn("assessOxlintRuntime")(function* (
  project: Project.Snapshot
) {
  const declared = (name: string) =>
    project.packageJson.devDependencies?.[name] ?? project.packageJson.dependencies?.[name]

  if (!declared("oxlint")) {
    return [] satisfies readonly Finding[]
  }

  return yield* Effect.gen(function* () {
    const cwd = yield* Project.Directory
    const { backend } = yield* resolveOxlintRuntime(cwd)

    if (declared("tsrs") && backend instanceof NoBackend) {
      return finding("Oxlint cannot resolve the declared tsrs backend or its launcher.", [
        "Install the target project's dependencies so that the tsrs-lint launcher is available.",
      ])
    }

    for (const plugin of oxlintPlugins) {
      if (plugin.runtime instanceof NativeRuntime && declared(plugin.name)) {
        const installed = yield* resolvePackageDirectory(cwd, plugin.name)

        if (Option.isNone(installed)) {
          return yield* new PackageNotInstalled({ packageName: plugin.name, project: cwd })
        }
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
      EffectOxlintBridgeMissing: (error) =>
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
