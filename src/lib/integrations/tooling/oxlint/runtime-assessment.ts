import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { Finding } from "#lib/integrations/base.ts"
import type { Project } from "#lib/workspace/project.ts"
import { oxlintPlugins } from "#lib/integrations/tooling/oxlint/plugins/index.ts"
import { resolveOxlintRuntime } from "#lib/integrations/tooling/oxlint/runtime.ts"
import { PackageNotInstalled } from "#lib/shared/errors.ts"
import { resolvePackageDirectory } from "#lib/workspace/module-resolver.ts"

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
    const runtime = yield* resolveOxlintRuntime(project.cwd)

    if (declared("tsrs") && Object.keys(runtime.backend).length === 0) {
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
