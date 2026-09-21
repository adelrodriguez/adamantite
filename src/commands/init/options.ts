import type { PackageManagerName } from "nypm"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Flag from "effect/unstable/cli/Flag"
import { InvalidInitOptions } from "#lib/shared/errors.ts"
import { hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import { checkIsSupportedPackageManager, type Script } from "#lib/workspace/package-json.ts"

const INIT_SCRIPTS = ["check", "fix", "analyze"] as const satisfies readonly Script[]

const INIT_PRESETS = [
  "react",
  "nextjs",
  "vue",
  "jest",
  "vitest",
  "node",
  "antislop",
  "shadcn",
] as const

const INIT_EDITORS = ["vscode", "zed"] as const

type InitEditor = (typeof INIT_EDITORS)[number]
type InitPreset = (typeof INIT_PRESETS)[number]

export interface InitOptions {
  readonly agents: boolean
  readonly editors: InitEditor[]
  readonly githubActions: boolean
  readonly installExtensions: boolean
  readonly overwriteScripts: boolean
  readonly presets: InitPreset[]
  readonly scripts: Script[]
  readonly typescript: boolean
}

export interface InitOptionsInput {
  readonly agents: boolean
  readonly editors: readonly InitEditor[]
  readonly githubActions: boolean
  readonly installExtensions: boolean
  readonly overwriteScripts: boolean
  readonly presets: readonly InitPreset[]
  readonly scripts: readonly Script[]
  readonly typescript: boolean
}

interface ValidateInitOptionsContext {
  readonly nonInteractive: boolean
  readonly packageManager: PackageManagerName
}

export const validateInitOptions = Effect.fn("validateInitOptions")(function* (
  input: InitOptionsInput,
  context: ValidateInitOptionsContext
) {
  const options: InitOptions = {
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

  const hasOxlint = options.scripts.includes("check") || options.scripts.includes("fix")

  if (options.presets.length > 0 && !hasOxlint) {
    return yield* new InvalidInitOptions({
      reason: "`--preset` requires the `check` or `fix` script.",
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
      reason: "`--github-actions` requires a CI-compatible script.",
    })
  }

  if (
    options.githubActions
    && context.nonInteractive
    && !checkIsSupportedPackageManager(context.packageManager)
  ) {
    return yield* new InvalidInitOptions({
      reason: `\`--github-actions\` does not support the detected package manager \`${context.packageManager}\`. Use bun, deno, npm, pnpm, or yarn.`,
    })
  }

  return options
})

const nonInteractive = Flag.Boolean("non-interactive").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Configure without prompts; requires at least one --script")
)

const scripts = Flag.Literals("script", INIT_SCRIPTS).pipe(
  Flag.atMost(INIT_SCRIPTS.length),
  Flag.withDescription(
    "Package script to configure; repeatable and required in non-interactive mode"
  )
)

const presets = Flag.Literals("preset", INIT_PRESETS).pipe(
  Flag.atMost(INIT_PRESETS.length),
  Flag.withDescription("Oxlint preset to configure; repeatable and requires --script check or fix")
)

const editors = Flag.Literals("editor", INIT_EDITORS).pipe(
  Flag.atMost(INIT_EDITORS.length),
  Flag.withDescription("Editor to configure; may be specified multiple times")
)

const typescript = Flag.Boolean("typescript").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Configure the TypeScript preset; requires --script check or fix")
)

const installExtensions = Flag.Boolean("install-extensions").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Install recommended extensions; requires at least one --editor")
)

const githubActions = Flag.Boolean("github-actions").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    "Configure CI; requires a compatible script and bun, deno, npm, pnpm, or yarn"
  )
)

const agents = Flag.Boolean("agents").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Add Adamantite guidance to AGENTS.md")
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
