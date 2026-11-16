import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { SupportedPackageManager } from "#lib/project/package-manager.ts"
import type { InitEditor, LintPreset, TypeScriptPreset } from "#lib/project/selection.ts"
import {
  findExcludedPresets,
  findMissingRequiredPresets,
} from "#lib/integrations/oxlint/presets.ts"
import { type Script, checkRunsTool, hasCICompatibleScripts } from "#lib/project/package-json.ts"
import { InvalidInitOptions } from "#lib/shared/errors.ts"

/**
 * The setup that init applies. Each optional part exists only with the parts that it needs, so the
 * options cannot select a preset without linting.
 */
export interface InitOptions {
  /**
   * Add the Adamantite section to `AGENTS.md` and the Adamantite skill.
   */
  readonly agents: boolean
  /**
   * The editors to configure.
   */
  readonly editors: Option.Option<Array.NonEmptyReadonlyArray<InitEditor>>
  /**
   * The package manager that the GitHub Actions workflow runs.
   */
  readonly githubActions: Option.Option<SupportedPackageManager>
  /**
   * The Oxlint setup, which the `check` and `fix` scripts need.
   */
  readonly lint: Option.Option<{
    readonly presets: readonly LintPreset[]
  }>
  /**
   * The managed scripts. `Setup.apply` sets each one in `package.json` and overwrites what it held.
   */
  readonly scripts: readonly Script[]
  /**
   * The TypeScript preset that `tsconfig.json` extends. It needs no script.
   */
  readonly typescript: Option.Option<TypeScriptPreset>
}

export interface InitOptionsInput {
  readonly agents: boolean
  readonly editors: readonly InitEditor[]
  readonly githubActions: boolean
  readonly presets: readonly LintPreset[]
  readonly scripts: readonly Script[]
  readonly typescript: Option.Option<TypeScriptPreset>
}

/**
 * Parses the flat options of the flags or the prompts into the setup that init applies.
 */
export const validateInitOptions = Effect.fn("validateInitOptions")(function* (
  input: InitOptionsInput,
  packageManager: SupportedPackageManager
) {
  const options = {
    agents: input.agents,
    editors: Array.dedupe(input.editors),
    githubActions: input.githubActions,
    presets: Array.dedupe(input.presets),
    scripts: Array.dedupe(input.scripts),
    typescript: input.typescript,
  }

  const hasOxlint = checkRunsTool(options.scripts, "oxlint")

  if (options.presets.length > 0 && !hasOxlint) {
    return yield* new InvalidInitOptions({
      reason: "`--preset` requires the `check` or `fix` script.",
    })
  }

  const missingPreset = Array.head(findMissingRequiredPresets(options.presets))

  if (Option.isSome(missingPreset)) {
    const { required, requiredBy } = missingPreset.value

    return yield* new InvalidInitOptions({
      reason: `\`--preset ${requiredBy}\` requires \`--preset ${required}\`.`,
    })
  }

  const excludedPreset = Array.head(findExcludedPresets(options.presets))

  if (Option.isSome(excludedPreset)) {
    const { excluded, preset } = excludedPreset.value

    return yield* new InvalidInitOptions({
      reason: `\`--preset ${preset}\` and \`--preset ${excluded}\` report the same defects. Select one of them.`,
    })
  }

  if (options.githubActions && !hasCICompatibleScripts(options.scripts)) {
    return yield* new InvalidInitOptions({
      reason: "`--github-actions` requires --script check or --script analyze.",
    })
  }

  return {
    agents: options.agents,
    editors: Array.isReadonlyArrayNonEmpty(options.editors)
      ? Option.some(options.editors)
      : Option.none(),
    githubActions: options.githubActions ? Option.some(packageManager) : Option.none(),
    lint: hasOxlint ? Option.some({ presets: options.presets }) : Option.none(),
    scripts: options.scripts,
    typescript: options.typescript,
  } satisfies InitOptions
})
