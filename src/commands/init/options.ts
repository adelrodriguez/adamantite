import type { PackageManagerName } from "nypm"
import * as Array from "effect/Array"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import {
  findMissingRequiredPresets,
  LINT_PRESETS,
  type LintPreset,
} from "#lib/integrations/tooling/oxlint/presets.ts"
import { InvalidInitOptions } from "#lib/shared/errors.ts"
import { hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import {
  checkIsSupportedPackageManager,
  type Script,
  type SupportedPackageManager,
  SCRIPT_ORDER,
  checkRunsTool,
  listSupportedPackageManagers,
} from "#lib/workspace/package-json.ts"

const INIT_EDITORS = ["vscode", "zed"] as const

type InitEditor = (typeof INIT_EDITORS)[number]

/**
 * The setup that init applies. Each optional part exists only with the parts that it needs, so the
 * options cannot select a preset without linting or an extension install without an editor.
 */
export interface InitOptions {
  /**
   * Add the Adamantite section to `AGENTS.md` and the Adamantite skill.
   */
  readonly agents: boolean
  /**
   * The editors to configure, and whether to install their recommended extensions.
   */
  readonly editors: Option.Option<{
    readonly installExtensions: boolean
    readonly names: Array.NonEmptyReadonlyArray<InitEditor>
  }>
  /**
   * The package manager that the GitHub Actions workflow runs.
   */
  readonly githubActions: Option.Option<SupportedPackageManager>
  /**
   * The Oxlint setup, which the `check` and `fix` scripts need.
   */
  readonly lint: Option.Option<{
    readonly presets: readonly LintPreset[]
    readonly typescript: boolean
  }>
  readonly overwriteScripts: boolean
  readonly scripts: readonly Script[]
}

export interface InitOptionsInput {
  readonly agents: boolean
  readonly editors: readonly InitEditor[]
  readonly githubActions: boolean
  readonly installExtensions: boolean
  readonly overwriteScripts: boolean
  readonly presets: readonly LintPreset[]
  readonly scripts: readonly Script[]
  readonly typescript: boolean
}

/**
 * Parses the flat options of the flags or the prompts into the setup that init applies.
 */
export const validateInitOptions = Effect.fn("validateInitOptions")(function* (
  input: InitOptionsInput,
  packageManager: PackageManagerName
) {
  const options = {
    agents: input.agents,
    editors: Array.dedupe(input.editors),
    githubActions: input.githubActions,
    installExtensions: input.installExtensions,
    overwriteScripts: input.overwriteScripts,
    presets: Array.dedupe(input.presets),
    scripts: Array.dedupe(input.scripts),
    typescript: input.typescript,
  }

  if (options.scripts.length === 0) {
    return yield* new InvalidInitOptions({
      reason: "Select at least one script with `--script <name>`.",
    })
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

  if (options.typescript && !hasOxlint) {
    return yield* new InvalidInitOptions({
      reason: "`--typescript` requires the `check` or `fix` script.",
    })
  }

  if (options.installExtensions && options.editors.length === 0) {
    return yield* new InvalidInitOptions({
      reason: "`--install-extensions` requires at least one `--editor`.",
    })
  }

  if (options.githubActions && !hasCICompatibleScripts(options.scripts)) {
    return yield* new InvalidInitOptions({
      reason: "`--github-actions` requires --script check or --script analyze.",
    })
  }

  if (options.githubActions && !checkIsSupportedPackageManager(packageManager)) {
    return yield* new InvalidInitOptions({
      reason: `\`--github-actions\` does not support the detected package manager \`${packageManager}\`. Use ${listSupportedPackageManagers("disjunction")}.`,
    })
  }

  return {
    agents: options.agents,
    editors: Array.isReadonlyArrayNonEmpty(options.editors)
      ? Option.some({ installExtensions: options.installExtensions, names: options.editors })
      : Option.none(),
    githubActions: options.githubActions
      ? Option.liftPredicate(packageManager, checkIsSupportedPackageManager)
      : Option.none(),
    lint: hasOxlint
      ? Option.some({ presets: options.presets, typescript: options.typescript })
      : Option.none(),
    overwriteScripts: options.overwriteScripts,
    scripts: options.scripts,
  } satisfies InitOptions
})

const nonInteractive = Flag.Boolean("non-interactive").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Configure without prompts. Select at least one --script")
)

const scripts = Flag.Literals("script", SCRIPT_ORDER).pipe(
  Flag.atMost(SCRIPT_ORDER.length),
  Flag.withDescription(
    "Add a package script. Repeat --script to add more. Required with --non-interactive"
  )
)

const presets = Flag.Literals("preset", LINT_PRESETS).pipe(
  Flag.atMost(LINT_PRESETS.length),
  Flag.withDescription(
    "Select an Oxlint preset. Repeat --preset to add more. Requires --script check or --script fix"
  )
)

const editors = Flag.Literals("editor", INIT_EDITORS).pipe(
  Flag.atMost(INIT_EDITORS.length),
  Flag.withDescription("Configure an editor. Repeat --editor to add more")
)

const typescript = Flag.Boolean("typescript").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Use the TypeScript preset. Requires --script check or --script fix")
)

const installExtensions = Flag.Boolean("install-extensions").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Install recommended editor extensions. Select at least one --editor")
)

const githubActions = Flag.Boolean("github-actions").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    `Add a GitHub Actions workflow. Requires --script check or --script analyze and ${listSupportedPackageManagers("disjunction")}`
  )
)

const agents = Flag.Boolean("agents").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    "Add Adamantite guidance to AGENTS.md and the Adamantite skill to the skill folders of your coding agents"
  )
)

const overwriteScripts = Flag.Boolean("overwrite-scripts").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    "Replace existing package scripts that conflict with Adamantite's managed commands"
  )
)

export const initCommandOptions = {
  agents,
  editors,
  githubActions,
  installExtensions,
  nonInteractive,
  overwriteScripts,
  presets,
  scripts,
  typescript,
}
