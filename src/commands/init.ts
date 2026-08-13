import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import type * as PlatformError from "effect/PlatformError"
import process from "node:process"
import type { PackageManagerName } from "nypm"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import type { ToolingConfigState } from "#lib/workspace/tooling/config.ts"
import github from "#lib/integrations/ci/github.ts"
import vscode from "#lib/integrations/editors/vscode.ts"
import zed from "#lib/integrations/editors/zed.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { DependencyInstaller } from "#lib/services/dependency-installer.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { InvalidInitOptions, NoPackageManager } from "#lib/shared/errors.ts"
import { printTitle } from "#lib/shared/terminal.ts"
import { writeAgentsGuidance } from "#lib/workspace/agents.ts"
import { hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"
import {
  checkIsSupportedPackageManager,
  readPackageJson,
  writePackageJson,
  MANAGED_SCRIPT_COMMANDS,
  type Script,
  type SupportedPackageManager,
} from "#lib/workspace/package-json.ts"
import tsconfig from "#lib/workspace/tsconfig.ts"

const installDependencies = (cwd: string, packages: string[]) =>
  Effect.gen(function* () {
    const dependencyInstaller = yield* DependencyInstaller
    const prompter = yield* Prompter
    yield* prompter.withSpinner(
      () =>
        Effect.gen(function* () {
          const isMonorepo = yield* checkIsMonorepo(cwd)

          yield* dependencyInstaller.addDevDependencies(packages, cwd, {
            silent: true,
            workspace: isMonorepo,
          })
        }),
      {
        failure: "Failed to install dependencies.",
        start: "Installing dependencies...",
        success: "Dependencies installed.",
      }
    )
  })

function setupToolConfig<E, R>(
  cwd: string,
  tool: {
    readonly config: string
    readonly detect: (
      cwd: string
    ) => Effect.Effect<
      ToolingConfigState,
      PlatformError.PlatformError,
      FileSystem.FileSystem | Path.Path
    >
    readonly name: string
  },
  create: Effect.Effect<void, E, R>
) {
  return Effect.gen(function* () {
    const prompter = yield* Prompter
    const outcome = yield* prompter.withSpinner(
      (spinner) =>
        Effect.gen(function* () {
          const state = yield* tool.detect(cwd)

          for (const warning of state.warnings) {
            yield* prompter.log.warning(warning)
          }

          if (state.active === null) {
            yield* spinner.message(`\`${tool.config}\` not found, creating...`)
            yield* create
            return { created: true, legacyConfig: null }
          }

          if (state.active.format === "ts") {
            yield* spinner.message(`Found \`${tool.config}\`, keeping existing config.`)
            return { created: false, legacyConfig: null }
          }

          yield* spinner.message(`Found \`${state.active.file}\`, keeping existing config.`)
          return { created: false, legacyConfig: state.active.file }
        }),
      {
        failure: `Failed to set up ${tool.name} config.`,
        start: `Setting up ${tool.name} config...`,
        success: (result) =>
          result.created
            ? `${tool.name} config created successfully.`
            : `${tool.name} config is ready.`,
      }
    )

    if (outcome.legacyConfig) {
      yield* prompter.log.info(
        `Legacy \`${outcome.legacyConfig}\` was preserved during \`adamantite init\`. Run \`adamantite doctor --fix\` to migrate it to the latest ${tool.name} config.`
      )
    }
  })
}

const addScripts = (cwd: string, scripts: Script[]) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const packageJson = yield* readPackageJson(cwd)
    yield* prompter.withSpinner(
      () =>
        Effect.gen(function* () {
          packageJson.scripts ??= {}

          for (const script of scripts) {
            packageJson.scripts[script] = MANAGED_SCRIPT_COMMANDS[script]
          }

          yield* writePackageJson(cwd, packageJson)
        }),
      {
        failure: "Failed to add scripts to `package.json`.",
        start: "Adding scripts to your `package.json`...",
        success: "Scripts added to your `package.json`",
      }
    )
  })

const setupTypescript = (cwd: string) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    yield* prompter.withSpinner(
      (spinner) =>
        Effect.gen(function* () {
          const typescriptExists = yield* tsconfig.detect(cwd)

          if (typescriptExists) {
            yield* spinner.message(`\`${tsconfig.config}\` found, updating...`)
            yield* tsconfig.update(cwd)
            return false
          }

          yield* spinner.message(`\`${tsconfig.config}\` not found, creating...`)
          yield* tsconfig.create(cwd)
          return true
        }),
      {
        failure: "Failed to set up TypeScript config.",
        start: "Setting up TypeScript config...",
        success: (created) =>
          created
            ? `\`${tsconfig.config}\` created successfully`
            : `\`${tsconfig.config}\` updated successfully`,
      }
    )
  })

const setupEditors = (cwd: string, editors: string[]) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    if (editors.includes("vscode")) {
      yield* prompter.withSpinner(
        (spinner) =>
          Effect.gen(function* () {
            const exists = yield* vscode.detect(cwd)
            yield* spinner.message(
              `\`${vscode.config}\` ${exists ? "found, updating" : "not found, creating"}...`
            )
            yield* exists ? vscode.update(cwd) : vscode.create(cwd)
            return !exists
          }),
        {
          failure: "Failed to set up VS Code config.",
          start: `Checking for \`${vscode.config}\`...`,
          success: (created) =>
            `\`${vscode.config}\` ${created ? "created" : "updated"} with Adamantite preset.`,
        }
      )
    }

    if (editors.includes("zed")) {
      yield* prompter.withSpinner(
        (spinner) =>
          Effect.gen(function* () {
            const exists = yield* zed.detect(cwd)
            yield* spinner.message(
              `\`${zed.config}\` ${exists ? "found, updating" : "not found, creating"}...`
            )
            yield* exists ? zed.update(cwd) : zed.create(cwd)
            return !exists
          }),
        {
          failure: "Failed to set up Zed config.",
          start: `Checking for \`${zed.config}\`...`,
          success: (created) =>
            `\`${zed.config}\` ${created ? "created" : "updated"} with Adamantite preset.`,
        }
      )
    }
  })

const installEditorExtensions = (editors: string[], scripts: Script[]) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const hasZed = editors.includes("zed")
    const hasVscode = editors.includes("vscode")

    yield* prompter
      .withSpinner(
        (spinner) =>
          Effect.gen(function* () {
            if (hasVscode) {
              yield* spinner.message("Installing VS Code extension...")
              yield* vscode.extension(scripts)
            }

            return true as const
          }),
        {
          start: "Installing editor extensions...",
          success:
            hasZed && !hasVscode
              ? "Zed extensions require manual install."
              : "Editor extensions installed successfully.",
        }
      )
      .pipe(
        Effect.catchTag("FailedToInstallExtension", (error) =>
          Effect.gen(function* () {
            yield* prompter.log.warning(`⚠️ ${error.message}`)
            yield* prompter.log.warning("Please install it manually after setup completes.")
            return false as const
          })
        ),
        Effect.catchTag("VscodeCliNotFound", () =>
          Effect.gen(function* () {
            yield* prompter.log.error("VSCode CLI ('code' command) not found.")
            yield* prompter.log.info("To install it:")
            yield* prompter.log.info("  1. Open VS Code")
            yield* prompter.log.info(
              "  2. Press Cmd+Shift+P (macOS) or Ctrl+Shift+P (Windows/Linux)"
            )
            yield* prompter.log.info("  3. Run 'Shell Command: Install \"code\" command in PATH'")
            return false as const
          })
        )
      )

    if (hasZed) {
      yield* prompter.log.info("Install the Zed `oxc` extension: zed://extension/oxc")
    }
  })

const setupGitHubActions = (
  cwd: string,
  packageManager: SupportedPackageManager,
  scripts: Script[]
) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const workflowPath = github.files[0].path
    yield* prompter.withSpinner(
      (spinner) =>
        Effect.gen(function* () {
          const exists = yield* github.detect(cwd)
          yield* spinner.message(
            exists ? `\`${workflowPath}\` found, updating...` : `Creating \`${workflowPath}\`...`
          )
          yield* exists
            ? github.update(cwd, { packageManager, scripts })
            : github.create(cwd, { packageManager, scripts })
          return !exists
        }),
      {
        failure: "Failed to set up GitHub Actions workflow.",
        start: "Setting up GitHub Actions workflow...",
        success: (created) =>
          `GitHub Actions workflow ${created ? "created" : "updated"} successfully.`,
      }
    )
  }).pipe(Effect.option)

const setupAgentsGuidance = (cwd: string, packageManager: PackageManagerName, scripts: Script[]) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const result = yield* prompter
      .withSpinner(() => writeAgentsGuidance(cwd, { packageManager, scripts }), {
        failure: "Failed to update AGENTS.md.",
        start: "Updating AGENTS.md...",
        success: "AGENTS.md check complete.",
      })
      .pipe(
        Effect.catchTag(["FailedToReadFile", "FailedToWriteFile"], (error) =>
          Effect.gen(function* () {
            yield* prompter.log.warning(
              `Could not update AGENTS.md. ${error.message} Adamantite will continue initialization.`
            )
            return "failed" as const
          })
        )
      )

    if (result === "failed") {
      return
    }

    if (result === "malformed") {
      yield* prompter.log.warning(
        "Could not update AGENTS.md because Adamantite markers are incomplete. Remove the stale ADAMANTITE marker and run adamantite init again."
      )
    }
  })

const INIT_SCRIPTS = [
  "check",
  "fix",
  "format",
  "check:monorepo",
  "fix:monorepo",
  "analyze",
] as const satisfies readonly Script[]

const INIT_PRESETS = ["react", "nextjs", "vue", "jest", "vitest", "node"] as const

const INIT_EDITORS = ["vscode", "zed"] as const

type InitEditor = (typeof INIT_EDITORS)[number]
type InitPreset = (typeof INIT_PRESETS)[number]

interface InitOptions {
  readonly agents: boolean
  readonly editors: InitEditor[]
  readonly githubActions: boolean
  readonly installExtensions: boolean
  readonly presets: InitPreset[]
  readonly scripts: Script[]
  readonly typescript: boolean
}

interface InitOptionsInput {
  readonly agents: boolean
  readonly editors: readonly InitEditor[]
  readonly githubActions: boolean
  readonly installExtensions: boolean
  readonly presets: readonly InitPreset[]
  readonly scripts: readonly Script[]
  readonly typescript: boolean
}

interface ValidateInitOptionsContext {
  readonly isMonorepo: boolean
  readonly nonInteractive: boolean
  readonly packageManager: PackageManagerName
}

const validateInitOptions = Effect.fn("validateInitOptions")(function* (
  input: InitOptionsInput,
  context: ValidateInitOptionsContext
) {
  const options: InitOptions = {
    agents: input.agents,
    editors: Array.dedupe(input.editors),
    githubActions: input.githubActions,
    installExtensions: input.installExtensions,
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
  const hasMonorepoScript =
    options.scripts.includes("check:monorepo") || options.scripts.includes("fix:monorepo")

  if (hasMonorepoScript && !context.isMonorepo) {
    return yield* new InvalidInitOptions({
      reason: "Monorepo scripts can only be selected in a detected monorepo.",
    })
  }

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
    options.githubActions &&
    context.nonInteractive &&
    !checkIsSupportedPackageManager(context.packageManager)
  ) {
    return yield* new InvalidInitOptions({
      reason: `\`--github-actions\` does not support the detected package manager \`${context.packageManager}\`. Use bun, deno, npm, pnpm, or yarn.`,
    })
  }

  return options
})

const nonInteractive = Flag.boolean("non-interactive").pipe(
  Flag.withDescription("Configure without prompts; requires at least one --script")
)

const scripts = Flag.choice("script", INIT_SCRIPTS).pipe(
  Flag.atMost(INIT_SCRIPTS.length),
  Flag.withDescription(
    "Package script to configure; repeatable and required in non-interactive mode. Monorepo scripts require a detected monorepo"
  )
)

const presets = Flag.choice("preset", INIT_PRESETS).pipe(
  Flag.atMost(INIT_PRESETS.length),
  Flag.withDescription("Oxlint preset to configure; repeatable and requires --script check or fix")
)

const editors = Flag.choice("editor", INIT_EDITORS).pipe(
  Flag.atMost(INIT_EDITORS.length),
  Flag.withDescription("Editor to configure; may be specified multiple times")
)

const typescript = Flag.boolean("typescript").pipe(
  Flag.withDescription("Configure the TypeScript preset; requires --script check or fix")
)

const installExtensions = Flag.boolean("install-extensions").pipe(
  Flag.withDescription("Install recommended extensions; requires at least one --editor")
)

const githubActions = Flag.boolean("github-actions").pipe(
  Flag.withDescription(
    "Configure CI; requires a compatible script and bun, deno, npm, pnpm, or yarn"
  )
)

const agents = Flag.boolean("agents").pipe(
  Flag.withDescription("Add Adamantite guidance to AGENTS.md")
)

const collectInteractiveInitOptions = Effect.fn("collectInteractiveInitOptions")(function* (
  isMonorepo: boolean
) {
  const prompter = yield* Prompter

  const selectedScripts = yield* prompter.multiselect({
    message: "Which scripts do you want to add to your `package.json`?",
    options: [
      {
        hint: "recommended",
        label: "check - find issues and type errors using oxlint",
        value: "check",
      },
      {
        hint: "recommended",
        label: "fix - fix code issues using oxlint",
        value: "fix",
      },
      {
        hint: "recommended",
        label: "format - code formatting using oxfmt",
        value: "format",
      },
      {
        disabled: !isMonorepo,
        hint: isMonorepo ? undefined : "available for monorepo projects",
        label: "check:monorepo - check for monorepo-specific issues using Sherif",
        value: "check:monorepo",
      },
      {
        disabled: !isMonorepo,
        hint: isMonorepo ? undefined : "available for monorepo projects",
        label: "fix:monorepo - fix monorepo-specific issues using Sherif",
        value: "fix:monorepo",
      },
      {
        label: "analyze - find unused dependencies, exports, and files using knip",
        value: "analyze",
      },
    ],
  })

  const hasOxlint = selectedScripts.includes("check") || selectedScripts.includes("fix")
  let selectedPresets: InitOptions["presets"] = []

  if (hasOxlint) {
    selectedPresets = yield* prompter.multiselect({
      message: "Which presets do you want to install? (core is always included)",
      options: [
        { label: "React", value: "react" },
        { label: "Next.js", value: "nextjs" },
        { label: "Vue", value: "vue" },
        { label: "Jest", value: "jest" },
        { label: "Vitest", value: "vitest" },
        { label: "Node", value: "node" },
      ],
      required: false,
    })
  }

  const shouldSetupTypescript = hasOxlint
    ? yield* prompter.confirm({
        initialValue: true,
        message:
          "Adamantite provides a TypeScript preset to enforce strict type-safety. Would you like to use it?",
      })
    : false

  const selectedEditors = yield* prompter.multiselect({
    message: "Which editors do you want to configure? (optional)",
    options: [
      { label: "VSCode / Cursor / Windsurf", value: "vscode" },
      { label: "Zed", value: "zed" },
    ],
    required: false,
  })

  const shouldInstallExtensions =
    selectedEditors.length > 0
      ? yield* prompter.confirm({
          initialValue: true,
          message: "Do you want to install the recommended editor extensions?",
        })
      : false

  const shouldEnableGitHubActions = hasCICompatibleScripts(selectedScripts)
    ? yield* prompter.confirm({
        message: "Do you want to add a GitHub Actions workflow to run checks in CI?",
      })
    : false

  const shouldAddAgentsGuidance = yield* prompter.confirm({
    initialValue: true,
    message:
      "Add Adamantite guidance to AGENTS.md so coding agents know how to run project checks?",
  })

  return {
    agents: shouldAddAgentsGuidance,
    editors: selectedEditors,
    githubActions: shouldEnableGitHubActions,
    installExtensions: shouldInstallExtensions,
    presets: selectedPresets,
    scripts: selectedScripts,
    typescript: shouldSetupTypescript,
  } satisfies InitOptionsInput
})

export default Command.make("init", {
  agents,
  editors,
  githubActions,
  installExtensions,
  nonInteractive,
  presets,
  scripts,
  typescript,
}).pipe(
  Command.withDescription(
    "Initialize Adamantite in the current directory. Setup flags require --non-interactive; omitted boolean setup flags are disabled"
  ),
  Command.withExamples([
    {
      command: "adamantite init --non-interactive --script check",
      description: "Configure linting without prompts",
    },
    {
      command:
        "adamantite init --non-interactive --script check --script format --preset react --editor vscode --typescript --install-extensions --github-actions --agents",
      description: "Configure a React project with VS Code, TypeScript, CI, and agent guidance",
    },
    {
      command: "adamantite init --non-interactive --script check:monorepo",
      description: "Configure monorepo checks in a detected monorepo",
    },
  ]),
  Command.withHandler((options) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter

      yield* printTitle()

      yield* prompter.intro("💠 adamantite init")

      const dependencyInstaller = yield* DependencyInstaller
      const packageManager = yield* dependencyInstaller.detectPackageManager(cwd)

      if (!packageManager) {
        return yield* new NoPackageManager({})
      }

      if (packageManager.warnings?.length) {
        for (const warning of packageManager.warnings) {
          yield* prompter.log.warning(warning)
        }
      }

      yield* prompter.log.info(`Detected package manager: ${packageManager.name}`)

      const isMonorepo = yield* checkIsMonorepo(cwd)

      if (isMonorepo) {
        yield* prompter.log.info("We've detected a monorepo setup in your project.")
      }

      if (
        !options.nonInteractive &&
        Array.some(
          [
            options.scripts.length > 0,
            options.presets.length > 0,
            options.editors.length > 0,
            options.typescript,
            options.installExtensions,
            options.githubActions,
            options.agents,
          ],
          Predicate.isTruthy
        )
      ) {
        return yield* new InvalidInitOptions({
          reason: "Setup flags require `--non-interactive`.",
        })
      }

      const input = options.nonInteractive
        ? options
        : yield* collectInteractiveInitOptions(isMonorepo)
      const initOptions = yield* validateInitOptions(input, {
        isMonorepo,
        nonInteractive: options.nonInteractive,
        packageManager: packageManager.name,
      })
      const selectedScripts = initOptions.scripts
      const presets = initOptions.presets
      const selectedEditors = initOptions.editors
      const shouldSetupTypescript = initOptions.typescript
      const installExtensions = initOptions.installExtensions
      const enableGitHubActions = initOptions.githubActions
      const shouldAddAgentsGuidance = initOptions.agents

      const hasOxlint = selectedScripts.includes("check") || selectedScripts.includes("fix")

      const hasOxfmt = selectedScripts.includes("format")
      const hasSherif =
        selectedScripts.includes("check:monorepo") || selectedScripts.includes("fix:monorepo")
      const hasKnip = selectedScripts.includes("analyze")

      const dependencies = ["adamantite"]

      if (hasOxlint) {
        dependencies.push(
          `${oxlint.name}@${oxlint.version}`,
          `${tsgolint.name}@${tsgolint.version}`
        )
      }

      if (hasOxfmt) {
        dependencies.push(`${oxfmt.name}@${oxfmt.version}`)
      }

      if (hasSherif) {
        dependencies.push(`${sherif.name}@${sherif.version}`)
      }

      if (hasKnip) {
        dependencies.push(`${knip.name}@${knip.version}`)
      }

      yield* installDependencies(cwd, dependencies)

      if (hasOxfmt) {
        yield* setupToolConfig(cwd, oxfmt, oxfmt.create(cwd))
      }

      if (hasOxlint) {
        yield* setupToolConfig(cwd, oxlint, oxlint.create(cwd, presets))
      }

      if (hasKnip) {
        yield* setupToolConfig(cwd, knip, knip.create(cwd))
      }

      yield* addScripts(cwd, selectedScripts)

      if (shouldAddAgentsGuidance) {
        yield* setupAgentsGuidance(cwd, packageManager.name, selectedScripts)
      }

      if (shouldSetupTypescript) {
        yield* setupTypescript(cwd)
      }

      yield* setupEditors(cwd, selectedEditors)

      if (installExtensions) {
        yield* installEditorExtensions(selectedEditors, selectedScripts)
      }

      if (enableGitHubActions) {
        const packageManagerName = packageManager.name

        if (checkIsSupportedPackageManager(packageManagerName)) {
          yield* setupGitHubActions(cwd, packageManagerName, selectedScripts)
        } else {
          yield* prompter.log.warning(
            `Skipping GitHub Actions setup: \`${packageManagerName}\` is not a supported package manager for CI workflow generation.`
          )
        }
      }

      yield* prompter.log.success("Your project is now configured")

      yield* prompter.outro("💠 Adamantite initialized successfully!")
    }).pipe(
      Effect.catchTags({
        OperationCancelled: () =>
          Effect.gen(function* () {
            const prompter = yield* Prompter
            yield* prompter.cancel("You've cancelled the initialization process.")
          }),
      })
    )
  )
)
