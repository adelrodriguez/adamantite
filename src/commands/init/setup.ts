import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import type * as PlatformError from "effect/PlatformError"
import type { PackageManagerName } from "nypm"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Match from "effect/Match"
import type { LintPreset } from "#lib/integrations/tooling/oxlint/presets.ts"
import { detectSkillFolders, writeSkill } from "#lib/execution/skill.ts"
import github from "#lib/integrations/ci/github.ts"
import vscode from "#lib/integrations/editors/vscode.ts"
import zed from "#lib/integrations/editors/zed.ts"
import {
  LegacyToolingConfig,
  MissingToolingConfig,
  type ToolingConfigState,
} from "#lib/integrations/tooling/base.ts"
import effectTsgo from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/index.ts"
import tsconfig, {
  getMonorepoGuidance,
  TYPESCRIPT_PRESETS,
  type TypeScriptPreset,
} from "#lib/integrations/workspace/tsconfig.ts"
import { writeAgentsGuidance } from "#lib/workspace/agents.ts"
import { hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import { addRootDevDependencies } from "#lib/workspace/dependency-installer.ts"
import {
  getConflictingScripts,
  getManagedScripts,
  readPackageJson,
  writePackageJson,
  MANAGED_SCRIPT_COMMANDS,
  type Script,
  type SupportedPackageManager,
} from "#lib/workspace/package-json.ts"
import * as Output from "#terminal/output.ts"
import { INIT_EDITORS, type InitEditor } from "./options.ts"

export const installDependencies = (cwd: string, packages: string[]) =>
  Effect.gen(function* () {
    yield* addRootDevDependencies(cwd, packages)
    yield* Output.success("Dependencies installed.")
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
    const { active, warnings } = yield* tool.detect(cwd)

    for (const warning of warnings) {
      yield* Output.warning(warning)
    }

    // Init creates only a missing config.
    if (active instanceof MissingToolingConfig) {
      yield* create
      yield* Output.success(`${tool.name} config created.`)
    } else {
      yield* Output.success(`Existing ${tool.name} config kept.`)
    }

    if (active instanceof LegacyToolingConfig) {
      yield* Output.info(
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
    const packageJson = yield* readPackageJson(cwd)

    if (scripts.length === 0) {
      return getManagedScripts(packageJson)
    }

    const conflicts = options.overwriteScripts ? [] : getConflictingScripts(packageJson, scripts)
    const conflictingNames = new Set(conflicts.map((conflict) => conflict.script))
    const writtenScripts = scripts.filter((script) => !conflictingNames.has(script))

    if (writtenScripts.length > 0) {
      packageJson.scripts ??= {}

      for (const script of writtenScripts) {
        packageJson.scripts[script] = MANAGED_SCRIPT_COMMANDS[script]
      }

      yield* writePackageJson(cwd, packageJson)
    }

    yield* Output.success(
      conflicts.length === 0
        ? "Scripts added to `package.json`."
        : writtenScripts.length === 0
          ? "Existing `package.json` scripts kept."
          : "Scripts added to `package.json`. Existing conflicting scripts were kept."
    )

    const replaceHint = options.nonInteractive
      ? "Use `--overwrite-scripts` to replace it."
      : "Run `adamantite init` again and choose to replace the script."

    for (const conflict of conflicts) {
      yield* Output.warning(
        `Kept existing \`${conflict.script}\` script (\`${conflict.command}\`) instead of \`${MANAGED_SCRIPT_COMMANDS[conflict.script]}\`. ${replaceHint}`
      )
    }

    if (conflicts.length > 0) {
      yield* Output.info(
        "Pass custom tool arguments after `--`, such as `adamantite analyze -- --directory packages/app`."
      )
    }

    // The scripts that package.json now manages, including scripts from earlier runs. A conflicting
    // script that init kept is not managed.
    return getManagedScripts(packageJson)
  })

export const setupTypescript = (cwd: string, isMonorepo: boolean, preset: TypeScriptPreset) =>
  Effect.gen(function* () {
    if (isMonorepo) {
      yield* pipe(
        getMonorepoGuidance(preset),
        Effect.forEach((line) => Output.info(line), { concurrency: 1 })
      )

      return
    }

    const exists = yield* tsconfig.detect(cwd)

    yield* exists ? tsconfig.update(cwd, preset) : tsconfig.create(cwd, preset)
    yield* Output.success(
      `\`${tsconfig.config}\` ${exists ? "updated" : "created"} with \`${TYPESCRIPT_PRESETS[preset]}\`.`
    )
  })

/**
 * Set up the part of the `effect` preset that is not the package: the language service entry in
 * `tsconfig.json`.
 */
export const setupEffectTsgo = (cwd: string) =>
  Effect.gen(function* () {
    const result = yield* effectTsgo.update(cwd)

    if (result === "monorepo") {
      yield* Output.info(
        "In a monorepo, add the Effect language service entry to each package's `tsconfig.json` or to a shared base config. Run `adamantite doctor` for the reference entry."
      )
    }

    if (result === "missing") {
      yield* Output.warning(
        "No `tsconfig.json` found, so the Effect language service is not configured. Run `adamantite doctor` for the reference entry."
      )
    }
  })

const editorIntegrations = { vscode, zed } as const satisfies Record<
  InitEditor,
  typeof vscode | typeof zed
>

export const setupEditors = (cwd: string, editors: readonly InitEditor[]) =>
  Effect.gen(function* () {
    // The editors run in the order of INIT_EDITORS, whatever order the flags give.
    for (const editor of INIT_EDITORS.filter((candidate) => editors.includes(candidate))) {
      const integration = editorIntegrations[editor]
      const exists = yield* integration.detect(cwd)

      yield* exists ? integration.update(cwd) : integration.create(cwd)
      yield* Output.success(
        `\`${integration.config}\` ${exists ? "updated" : "created"} with Adamantite preset.`
      )
    }
  })

export const installEditorExtensions = (
  editors: readonly InitEditor[],
  scripts: Script[],
  presets: readonly LintPreset[] = []
) =>
  Effect.gen(function* () {
    const hasZed = editors.includes("zed")
    const hasVscode = editors.includes("vscode")

    yield* (hasVscode ? vscode.extension(scripts, presets) : Effect.void).pipe(
      Effect.andThen(
        Output.success(
          hasVscode
            ? "Editor extensions installed."
            : "Install the Zed extensions using the links below."
        )
      ),
      Effect.catchTags({
        FailedToInstallExtension: (error) =>
          Effect.gen(function* () {
            yield* Output.warning(error.message)
            yield* Output.warning("Install the extension manually after setup finishes.")
          }),
        VscodeCliNotFound: () =>
          Effect.gen(function* () {
            yield* Output.error("VS Code's `code` command was not found on PATH.")
            yield* Output.info("Add the code command to PATH:")
            yield* Output.info("  1. Open VS Code")
            yield* Output.info("  2. Press Cmd+Shift+P (macOS) or Ctrl+Shift+P (Windows/Linux)")
            yield* Output.info("  3. Run 'Shell Command: Install \"code\" command in PATH'")
          }),
      })
    )

    if (hasZed) {
      yield* Output.info("Install the Zed `oxc` extension: zed://extension/oxc")

      if (presets.includes("effect")) {
        yield* Output.info(
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
    // A conflicting script that init kept is not managed, so it can leave no script to run in CI.
    if (!hasCICompatibleScripts(scripts)) {
      return yield* Output.warning(
        "No CI script runs an Adamantite command, so `adamantite init` did not set up the GitHub Actions workflow."
      )
    }

    const state = yield* github.detect(cwd)

    const update = () => github.update(cwd, { packageManager, scripts })

    const result = yield* Match.valueTags(state, {
      Legacy: update,
      Malformed: () => Effect.succeed("kept" as const),
      Managed: update,
      Missing: () =>
        github.create(cwd, { packageManager, scripts }).pipe(Effect.as("created" as const)),
    })

    yield* Output.success(`GitHub Actions workflow ${result}.`)

    const reportKept = (workflowPath: string) =>
      result === "kept"
        ? Output.info(
            `\`${workflowPath}\` has changes that Adamantite did not make, so \`adamantite init\` kept it. Run \`adamantite doctor\` to see what to update.`
          )
        : Effect.void

    yield* Match.valueTags(state, {
      Legacy: ({ path }) => reportKept(path),
      Malformed: ({ paths, reason }) =>
        Output.warning(
          `Adamantite cannot read the managed block in ${paths.map((workflowPath) => `\`${workflowPath}\``).join(", ")}, so \`adamantite init\` kept the workflow. ${reason} Run \`adamantite doctor\` for the repair.`
        ),
      Managed: ({ path }) => reportKept(path),
      Missing: () => Effect.void,
    })
  }).pipe(
    // GitHub Actions setup is optional, so initialization continues; the failure must still
    // reach the user instead of disappearing. Named tags keep a future error type from
    // degrading to a warning without an explicit decision.
    Effect.catchTag(
      ["FailedToCreateDirectory", "FailedToParseFile", "FailedToReadFile", "FailedToWriteFile"],
      (error) =>
        Effect.gen(function* () {
          yield* Output.warning(`Could not set up the GitHub Actions workflow. ${error.message}`)
          yield* Output.warning(
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
  writeAgentsGuidance(cwd, { isMonorepo, packageManager, scripts }).pipe(
    Effect.flatMap((result) =>
      result === "malformed"
        ? Output.warning(
            "AGENTS.md has an incomplete ADAMANTITE marker. Remove the incomplete marker and run `adamantite init` again."
          )
        : Output.success("AGENTS.md updated.")
    ),
    Effect.catchTag(["FailedToReadFile", "FailedToWriteFile"], (error) =>
      Output.warning(
        `Could not update AGENTS.md. ${error.message} Adamantite will continue initialization.`
      )
    )
  )

const folderList = new Intl.ListFormat("en", { type: "conjunction" })

/**
 * Write the Adamantite skill to the skill folders of the agents that the project uses. The skill is
 * optional, so a failure leaves a warning and initialization continues.
 */
export const setupSkill = (cwd: string) =>
  detectSkillFolders(cwd).pipe(
    Effect.flatMap((folders) =>
      writeSkill(cwd, folders).pipe(
        Effect.andThen(
          Output.success(
            `Adamantite skill added to ${folderList.format(folders.map((folder) => `\`${folder}\``))}.`
          )
        )
      )
    ),
    Effect.catchTag(["FailedToCreateDirectory", "FailedToReadFile", "FailedToWriteFile"], (error) =>
      Output.warning(
        `Could not add the Adamantite skill. ${error.message} Adamantite will continue initialization.`
      )
    )
  )
