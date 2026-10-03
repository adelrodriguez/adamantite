import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { definePackageTooling } from "#lib/integrations/tooling/base.ts"
import { getImportedLintPresets, type LintPreset } from "#lib/integrations/tooling/oxlint/config.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"

const OXLINT_CONFIG_FILE = "oxlint.config.ts"

const checkImportsLintPreset = Effect.fn("checkImportsLintPreset")(function* (
  cwd: string,
  preset: string
) {
  const path = yield* Path.Path
  const content = yield* readFileIfExists(path.join(cwd, OXLINT_CONFIG_FILE))

  return Option.match(content, {
    onNone: () => false,
    onSome: (value) => getImportedLintPresets(value).includes(preset),
  })
})

/**
 * A managed plugin: an Oxlint plugin package the target project installs for one lint preset. The
 * package is required only while `oxlint.config.ts` imports that preset.
 */
export function defineManagedPlugin<PrepareError = never, PrepareRequirements = never>(options: {
  readonly name: string
  /**
   * An install step that the package needs, such as a binary patch. While the plugin applies,
   * `adamantite prepare` runs it after each install, and `init` and `update` run it after they
   * install packages.
   */
  readonly prepare?: (cwd: string) => Effect.Effect<void, PrepareError, PrepareRequirements>
  /**
   * The lint preset that loads the plugin, such as `shadcn` for `adamantite/lint/shadcn`.
   */
  readonly preset: LintPreset
  readonly version: string
}) {
  return {
    ...definePackageTooling({
      isRequired: (cwd) => checkImportsLintPreset(cwd, options.preset),
      name: options.name,
      purpose: `the \`adamantite/lint/${options.preset}\` preset`,
      scripts: ["check", "fix"],
      version: options.version,
    }),
    prepare: options.prepare,
    preset: options.preset,
  }
}
