import type { PackageManagerName } from "nypm"
import * as Array from "effect/Array"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import { type SkillsAgent, codingAgents } from "#lib/execution/coding-agents.ts"
import { type SkillFolder, skillFolders } from "#lib/execution/skill.ts"
import { LINT_PRESETS, type LintPreset } from "#lib/integrations/tooling/oxlint/config.ts"
import { InvalidInitOptions } from "#lib/shared/errors.ts"
import { hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import {
  checkIsSupportedPackageManager,
  type Script,
  type SupportedPackageManager,
} from "#lib/workspace/package-json.ts"

const INIT_SCRIPTS = ["check", "fix", "analyze"] as const satisfies readonly Script[]

const INIT_EDITORS = ["vscode", "zed"] as const

type InitEditor = (typeof INIT_EDITORS)[number]

export interface InitOptions {
  readonly agents: boolean
  readonly editors: InitEditor[]
  /**
   * The package manager that the GitHub Actions workflow runs, or `undefined` for no workflow.
   */
  readonly githubActions: SupportedPackageManager | undefined
  readonly installExtensions: boolean
  readonly overwriteScripts: boolean
  readonly presets: LintPreset[]
  readonly scripts: Script[]
  readonly skillFolders: SkillFolder[]
  readonly typescript: boolean
}

export interface InitOptionsInput {
  readonly agents: boolean
  readonly editors: readonly InitEditor[]
  readonly githubActions: boolean
  readonly installExtensions: boolean
  readonly overwriteScripts: boolean
  readonly presets: readonly LintPreset[]
  readonly scripts: readonly Script[]
  readonly skillFolders: readonly SkillFolder[]
  readonly typescript: boolean
}

/**
 * The skill folders that the agents of `--skill-agent` read. Agents that share a folder select it
 * once.
 */
export const getSkillFolders = (agents: readonly SkillsAgent[]): SkillFolder[] =>
  codingAgents
    .filter((agent) => agents.includes(agent.skillsAgent))
    .map((agent) => agent.skillsFolder)

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
    // Menu order, whatever the selection order.
    skillFolders: skillFolders.filter((folder) => input.skillFolders.includes(folder)),
    typescript: input.typescript,
  }

  if (options.scripts.length === 0) {
    return yield* new InvalidInitOptions({
      reason: "Select at least one script with `--script <name>`.",
    })
  }

  const hasOxlint = options.scripts.includes("check") || options.scripts.includes("fix")

  if (options.presets.length > 0 && !hasOxlint) {
    return yield* new InvalidInitOptions({
      reason: "`--preset` requires the `check` or `fix` script.",
    })
  }

  if (options.presets.includes("react-strict") && !options.presets.includes("react")) {
    return yield* new InvalidInitOptions({
      reason: "`--preset react-strict` requires `--preset react`.",
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

  const githubActions =
    options.githubActions && checkIsSupportedPackageManager(packageManager)
      ? packageManager
      : undefined

  if (options.githubActions && githubActions === undefined) {
    return yield* new InvalidInitOptions({
      reason: `\`--github-actions\` does not support the detected package manager \`${packageManager}\`. Use bun, deno, npm, pnpm, or yarn.`,
    })
  }

  return { ...options, githubActions } satisfies InitOptions
})

const nonInteractive = Flag.Boolean("non-interactive").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Configure without prompts. Select at least one --script")
)

const scripts = Flag.Literals("script", INIT_SCRIPTS).pipe(
  Flag.atMost(INIT_SCRIPTS.length),
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
    "Add a GitHub Actions workflow. Requires --script check or --script analyze and bun, deno, npm, pnpm, or yarn"
  )
)

const agents = Flag.Boolean("agents").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Add Adamantite guidance to AGENTS.md")
)

const skillAgents = Flag.Literals(
  "skill-agent",
  codingAgents.map((agent) => agent.skillsAgent)
).pipe(
  Flag.atMost(codingAgents.length),
  Flag.withDescription(
    "Install the Adamantite skill for a coding agent. Repeat --skill-agent to select more"
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
  skillAgents,
  typescript,
}
