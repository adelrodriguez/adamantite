import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import effectTsgo from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo.ts"
import reactDoctor from "#lib/integrations/tooling/oxlint/plugins/react-doctor.ts"
import shadcn from "#lib/integrations/tooling/oxlint/plugins/shadcn.ts"

/**
 * Every managed plugin. Init installs the ones whose preset is selected. Doctor and update keep a
 * plugin on its pinned version only while `oxlint.config.ts` imports its preset.
 */
export const managedPlugins = [shadcn, reactDoctor, effectTsgo] as const

/**
 * The managed plugins whose `prepare` step applies to the project: the plugin has one, and its
 * assessment applies. Run each step after an install.
 */
export const getPluginsToPrepare = Effect.fn("getPluginsToPrepare")(function* (
  cwd: string,
  packageJson: PackageJson
) {
  const plugins = yield* pipe(
    managedPlugins,
    Effect.forEach((plugin) => {
      const { prepare } = plugin

      return prepare === undefined
        ? Effect.succeed([])
        : plugin
            .assess(cwd, packageJson)
            .pipe(
              Effect.map((assessment) =>
                assessment.applicable ? [{ name: plugin.name, prepare }] : []
              )
            )
    })
  )

  return plugins.flat()
})
