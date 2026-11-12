import type { PackageManagerName } from "nypm"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { TypeScriptPreset } from "#lib/integrations/workspace/tsconfig.ts"
import {
  describeLintPreset,
  findMissingRequiredPresets,
  lintPresets,
} from "#lib/integrations/tooling/oxlint/presets.ts"
import { hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import {
  checkIsSupportedPackageManager,
  getConflictingScripts,
  readPackageJson,
  MANAGED_SCRIPT_COMMANDS,
  type ScriptConflict,
  checkRunsTool,
  listSupportedPackageManagers,
} from "#lib/workspace/package-json.ts"
import { Prompter } from "#terminal/prompter.ts"
import { INIT_EDITOR_LABELS, INIT_EDITORS, type InitOptionsInput } from "./options.ts"

const describeScriptConflict = (conflict: ScriptConflict) =>
  `\`${conflict.script}\` runs \`${conflict.command}\`. Adamantite would replace it with \`${MANAGED_SCRIPT_COMMANDS[conflict.script]}\`.`

/**
 * Asks for the lint presets, and adds each preset that a selected preset requires.
 */
const promptPresets = Effect.gen(function* () {
  const prompter = yield* Prompter

  const selected = yield* prompter.multiselect({
    message: "Which presets should Adamantite use with the core preset?",
    options: lintPresets.map((preset) => ({
      hint: describeLintPreset(preset),
      label: preset.label,
      value: preset.name,
    })),
    required: false,
  })

  const missingPresets = findMissingRequiredPresets(selected)

  for (const { required, requiredBy } of missingPresets) {
    yield* prompter.log.info(`Added the \`${required}\` preset, which \`${requiredBy}\` requires.`)
  }

  return [...missingPresets.map(({ required }) => required), ...selected]
})

export const collectInteractiveInitOptions = Effect.fn("collectInteractiveInitOptions")(function* (
  cwd: string,
  isMonorepo: boolean,
  packageManager: PackageManagerName
) {
  const prompter = yield* Prompter

  const selectedScripts = yield* prompter.multiselect({
    message: "Which scripts should Adamantite add to `package.json`?",
    options: [
      {
        hint: "recommended",
        label: "check - find formatting, lint, and type errors",
        value: "check",
      },
      {
        hint: "recommended",
        label: "fix - apply safe lint fixes and format code",
        value: "fix",
      },
      {
        label: isMonorepo
          ? "analyze - find unused code and check monorepo consistency"
          : "analyze - find unused dependencies, exports, and files",
        value: "analyze",
      },
    ],
    required: false,
  })

  const packageJson = yield* readPackageJson(cwd)
  const conflicts = getConflictingScripts(packageJson, selectedScripts)

  for (const conflict of conflicts) {
    yield* prompter.log.warning(describeScriptConflict(conflict))
  }

  const shouldOverwriteScripts =
    conflicts.length > 0
      ? yield* prompter.confirm({
          initialValue: false,
          message:
            conflicts.length === 1
              ? "Replace this script with Adamantite's command?"
              : "Replace these scripts with Adamantite's commands?",
        })
      : false

  const hasOxlint = checkRunsTool(selectedScripts, "oxlint")
  const selectedPresets = hasOxlint ? yield* promptPresets : []

  const shouldSetupTypescript = yield* prompter.confirm({
    initialValue: true,
    message: "Use an Adamantite TypeScript preset?",
  })

  const typescriptPreset = shouldSetupTypescript
    ? Option.some(
        yield* prompter.select<TypeScriptPreset>({
          message: "Which TypeScript preset should Adamantite use?",
          options: [
            {
              hint: "JSON.parse() returns unknown, not any. Avoid in libraries.",
              label: "Strict types",
              value: "typescript",
            },
            {
              hint: "No changes to built-in types. Use for libraries.",
              label: "Strict config",
              value: "tsconfig",
            },
          ],
        })
      )
    : Option.none()

  const selectedEditors = yield* prompter.multiselect({
    message: "Which editors should Adamantite configure?",
    options: INIT_EDITORS.map((editor) => ({ label: INIT_EDITOR_LABELS[editor], value: editor })),
    required: false,
  })

  const shouldInstallExtensions =
    selectedEditors.length > 0
      ? yield* prompter.confirm({
          initialValue: true,
          message: "Install the recommended editor extensions?",
        })
      : false

  const canEnableGitHubActions = checkIsSupportedPackageManager(packageManager)
  const keptConflicts = shouldOverwriteScripts ? [] : conflicts.map((conflict) => conflict.script)

  // The workflow runs the selected scripts that init makes managed. A conflicting script that the
  // user keeps does not run Adamantite, and init accepts the workflow only for a selected script.
  const writtenScripts = selectedScripts.filter((script) => !keptConflicts.includes(script))

  if (hasCICompatibleScripts(writtenScripts) && !canEnableGitHubActions) {
    yield* prompter.log.info(
      `Adamantite cannot generate a GitHub Actions workflow for \`${packageManager}\`. It supports ${listSupportedPackageManagers("conjunction")}.`
    )
  }

  const shouldEnableGitHubActions =
    hasCICompatibleScripts(writtenScripts) && canEnableGitHubActions
      ? yield* prompter.confirm({
          message: "Add a GitHub Actions workflow to run the selected checks?",
        })
      : false

  const shouldSetupAgents = yield* prompter.confirm({
    initialValue: true,
    message:
      "Teach coding agents to use Adamantite? This adds an AGENTS.md section and the Adamantite skill.",
  })

  return {
    agents: shouldSetupAgents,
    editors: selectedEditors,
    githubActions: shouldEnableGitHubActions,
    installExtensions: shouldInstallExtensions,
    overwriteScripts: shouldOverwriteScripts,
    presets: selectedPresets,
    scripts: selectedScripts,
    typescript: typescriptPreset,
  } satisfies InitOptionsInput
})
