import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import type * as PlatformError from "effect/PlatformError"
import type { PackageManagerName } from "nypm"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import type { ToolingConfigState } from "#lib/workspace/tooling/config.ts"
import github from "#lib/integrations/ci/github.ts"
import vscode from "#lib/integrations/editors/vscode.ts"
import zed from "#lib/integrations/editors/zed.ts"
import { writeAgentsGuidance } from "#lib/workspace/agents.ts"
import { addRootDevDependencies } from "#lib/workspace/dependency-installer.ts"
import {
  getConflictingScripts,
  readPackageJson,
  writePackageJson,
  MANAGED_SCRIPT_COMMANDS,
  type Script,
  type SupportedPackageManager,
} from "#lib/workspace/package-json.ts"
import tsconfig, { MONOREPO_GUIDANCE } from "#lib/workspace/tsconfig.ts"
import { Prompter } from "#terminal/prompter.ts"

export const installDependencies = (cwd: string, packages: string[]) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    yield* prompter.withSpinner(() => addRootDevDependencies(cwd, packages), {
      failure: "Failed to install dependencies.",
      start: "Installing dependencies...",
      success: "Dependencies installed.",
    })
  })

export function setupToolConfig<E, R>(
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
        `Legacy \`${outcome.legacyConfig}\` was preserved during \`adamantite init\`. Run \`adamantite doctor\` and follow its findings to migrate it to the latest ${tool.name} config.`
      )
    }
  })
}

export const addScripts = (
  cwd: string,
  scripts: Script[],
  options: { readonly nonInteractive: boolean; readonly overwriteScripts: boolean }
) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const packageJson = yield* readPackageJson(cwd)
    const conflicts = options.overwriteScripts ? [] : getConflictingScripts(packageJson, scripts)
    const conflictingNames = new Set(conflicts.map((conflict) => conflict.script))
    const writtenScripts = scripts.filter((script) => !conflictingNames.has(script))

    yield* prompter.withSpinner(
      () =>
        Effect.gen(function* () {
          if (writtenScripts.length === 0) {
            return
          }

          packageJson.scripts ??= {}

          for (const script of writtenScripts) {
            packageJson.scripts[script] = MANAGED_SCRIPT_COMMANDS[script]
          }

          yield* writePackageJson(cwd, packageJson)
        }),
      {
        failure: "Failed to add scripts to `package.json`.",
        start: "Adding scripts to your `package.json`...",
        success:
          conflicts.length === 0
            ? "Scripts added to your `package.json`"
            : writtenScripts.length === 0
              ? "Kept your existing `package.json` scripts."
              : "Scripts added to your `package.json`; conflicting scripts were kept.",
      }
    )

    const replaceHint = options.nonInteractive
      ? "Use `--overwrite-scripts` to replace it."
      : "Re-run `adamantite init` and confirm overwriting to replace it."

    for (const conflict of conflicts) {
      yield* prompter.log.warning(
        `Kept existing \`${conflict.script}\` script (\`${conflict.command}\`) instead of \`${MANAGED_SCRIPT_COMMANDS[conflict.script]}\`. ${replaceHint}`
      )
    }

    if (conflicts.length > 0) {
      yield* prompter.log.info(
        "Adamantite commands forward extra arguments after `--`, so custom flags can be kept, e.g. `adamantite analyze -- --directory packages/app`."
      )
    }

    return writtenScripts
  })

export const setupTypescript = (cwd: string, isMonorepo: boolean) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter

    if (isMonorepo) {
      yield* pipe(
        MONOREPO_GUIDANCE,
        Effect.forEach((line) => prompter.log.info(line))
      )
      return
    }

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

export const setupEditors = (cwd: string, editors: string[]) =>
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

export const installEditorExtensions = (editors: string[], scripts: Script[]) =>
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

export const setupGitHubActions = (
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
  }).pipe(
    // GitHub Actions setup is optional, so initialization continues; the failure must still
    // reach the user instead of disappearing. Named tags keep a future error type from
    // degrading to a warning without an explicit decision.
    Effect.catchTag(
      [
        "FailedToCreateDirectory",
        "FailedToParseFile",
        "FailedToReadFile",
        "FailedToWriteFile",
        "PlatformError",
      ],
      (error) =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          yield* prompter.log.warning(
            `Could not set up the GitHub Actions workflow. ${error.message}`
          )
          yield* prompter.log.warning(
            "Fix the reported problem and run `adamantite init` again, or create the workflow manually."
          )
        })
    )
  )

export const setupAgentsGuidance = (
  cwd: string,
  packageManager: PackageManagerName,
  scripts: Script[],
  isMonorepo: boolean
) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const result = yield* prompter
      .withSpinner(() => writeAgentsGuidance(cwd, { isMonorepo, packageManager, scripts }), {
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
