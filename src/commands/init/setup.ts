import type { PackageManagerName } from "nypm"
import * as Effect from "effect/Effect"
import type { LintPreset } from "#lib/project/selection.ts"
import { detectSkillFolders, writeSkill } from "#lib/execution/skill.ts"
import { writeAgentsGuidance } from "#lib/project/agents.ts"
import { addRootDevDependencies } from "#lib/project/dependency-installer.ts"
import {
  getConflictingScripts,
  getManagedScripts,
  readPackageJson,
  writePackageJson,
  MANAGED_SCRIPT_COMMANDS,
  type Script,
} from "#lib/project/package-json.ts"
import * as Output from "#terminal/output.ts"

export const installDependencies = (cwd: string, packages: string[]) =>
  Effect.gen(function* () {
    yield* addRootDevDependencies(cwd, packages)
    yield* Output.success("Dependencies installed.")
  })

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

/**
 * Print the links that install the Zed extensions of the setup.
 */
export const printZedExtensions = (presets: readonly LintPreset[]) =>
  Effect.gen(function* () {
    yield* Output.info("Install the Zed `oxc` extension: zed://extension/oxc")

    if (presets.includes("effect")) {
      yield* Output.info(
        "Install the Zed TypeScript language server extension: zed://extension/tsgo"
      )
    }
  })

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
