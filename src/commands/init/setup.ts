import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import type * as PlatformError from "effect/PlatformError"
import type { PackageManagerName } from "nypm"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import type { ToolingConfigState } from "#lib/integrations/tooling/base.ts"
import { detectSkillFolders, writeSkill } from "#lib/execution/skill.ts"
import github from "#lib/integrations/ci/github.ts"
import vscode from "#lib/integrations/editors/vscode.ts"
import zed from "#lib/integrations/editors/zed.ts"
import effectTsgo from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/index.ts"
import tsconfig, { MONOREPO_GUIDANCE } from "#lib/integrations/workspace/tsconfig.ts"
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
    // Init creates only a missing config, so the detected state also tells what init did.
    const active = yield* prompter.withSpinner(
      (spinner) =>
        Effect.gen(function* () {
          const state = yield* tool.detect(cwd)

          for (const warning of state.warnings) {
            yield* prompter.log.warning(warning)
          }

          if (state.active._tag === "Missing") {
            yield* spinner.message(`\`${tool.config}\` not found, creating...`)
            yield* create
          } else {
            yield* spinner.message(`Found \`${state.active.file.file}\`, keeping it.`)
          }

          return state.active
        }),
      {
        failure: `Failed to set up ${tool.name} config.`,
        start: `Setting up ${tool.name} config...`,
        success: (detected) =>
          detected._tag === "Missing"
            ? `${tool.name} config created.`
            : `Existing ${tool.name} config kept.`,
      }
    )

    if (active._tag === "Legacy") {
      yield* prompter.log.info(
        `Legacy \`${active.file.file}\` was kept during \`adamantite init\`. Run \`adamantite doctor\` for instructions to migrate to the current ${tool.name} config.`
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
            ? "Scripts added to `package.json`."
            : writtenScripts.length === 0
              ? "Existing `package.json` scripts kept."
              : "Scripts added to `package.json`. Existing conflicting scripts were kept.",
      }
    )

    const replaceHint = options.nonInteractive
      ? "Use `--overwrite-scripts` to replace it."
      : "Run `adamantite init` again and choose to replace the script."

    for (const conflict of conflicts) {
      yield* prompter.log.warning(
        `Kept existing \`${conflict.script}\` script (\`${conflict.command}\`) instead of \`${MANAGED_SCRIPT_COMMANDS[conflict.script]}\`. ${replaceHint}`
      )
    }

    if (conflicts.length > 0) {
      yield* prompter.log.info(
        "Pass custom tool arguments after `--`, such as `adamantite analyze -- --directory packages/app`."
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
          created ? `\`${tsconfig.config}\` created.` : `\`${tsconfig.config}\` updated.`,
      }
    )
  })

/**
 * Set up the part of the `effect` preset that is not the package: the language service entry in
 * `tsconfig.json`.
 */
export const setupEffectTsgo = (cwd: string) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const result = yield* effectTsgo.update(cwd)

    if (result === "monorepo") {
      yield* prompter.log.info(
        "In a monorepo, add the Effect language service entry to each package's `tsconfig.json` or to a shared base config. Run `adamantite doctor` for the reference entry."
      )
    }

    if (result === "missing") {
      yield* prompter.log.warning(
        "No `tsconfig.json` found, so the Effect language service is not configured. Run `adamantite doctor` for the reference entry."
      )
    }
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

export const installEditorExtensions = (
  editors: string[],
  scripts: Script[],
  presets: readonly string[] = []
) =>
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
              yield* vscode.extension(scripts, presets)
            }

            return true as const
          }),
        {
          start: "Installing editor extensions...",
          success:
            hasZed && !hasVscode
              ? "Install the Zed extensions using the links below."
              : "Editor extensions installed.",
        }
      )
      .pipe(
        Effect.catchTags({
          FailedToInstallExtension: (error) =>
            Effect.gen(function* () {
              yield* prompter.log.warning(`⚠️ ${error.message}`)
              yield* prompter.log.warning("Install the extension manually after setup finishes.")
              return false as const
            }),
          VscodeCliNotFound: () =>
            Effect.gen(function* () {
              yield* prompter.log.error("VS Code's `code` command was not found on PATH.")
              yield* prompter.log.info("Add the code command to PATH:")
              yield* prompter.log.info("  1. Open VS Code")
              yield* prompter.log.info(
                "  2. Press Cmd+Shift+P (macOS) or Ctrl+Shift+P (Windows/Linux)"
              )
              yield* prompter.log.info("  3. Run 'Shell Command: Install \"code\" command in PATH'")
              return false as const
            }),
        })
      )

    if (hasZed) {
      yield* prompter.log.info("Install the Zed `oxc` extension: zed://extension/oxc")
      if (presets.includes("effect")) {
        yield* prompter.log.info(
          "Install the Zed TypeScript language server extension: zed://extension/tsgo"
        )
      }
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
        success: (created) => `GitHub Actions workflow ${created ? "created" : "updated"}.`,
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
        "AGENTS.md has an incomplete ADAMANTITE marker. Remove the incomplete marker and run `adamantite init` again."
      )
    }
  })

const folderList = new Intl.ListFormat("en", { type: "conjunction" })

/**
 * Write the Adamantite skill to the skill folders of the agents that the project uses. The skill is
 * optional, so a failure leaves a warning and initialization continues.
 */
export const setupSkill = (cwd: string) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter

    yield* detectSkillFolders(cwd).pipe(
      Effect.flatMap((folders) =>
        prompter.withSpinner(() => writeSkill(cwd, folders), {
          failure: "Failed to add the Adamantite skill.",
          start: "Adding the Adamantite skill...",
          success: `Adamantite skill added to ${folderList.format(folders.map((folder) => `\`${folder}\``))}.`,
        })
      ),
      Effect.catchTag(
        ["FailedToCreateDirectory", "FailedToReadFile", "FailedToWriteFile"],
        (error) =>
          prompter.log.warning(
            `Could not add the Adamantite skill. ${error.message} Adamantite will continue initialization.`
          )
      )
    )
  })
