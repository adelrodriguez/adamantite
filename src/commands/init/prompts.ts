import type * as Terminal from "effect/Terminal"
import type { PackageManagerName } from "nypm"
import * as Array from "effect/Array"
import * as Prompt from "effect/cli/Prompt"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { TypeScriptPreset } from "#lib/integrations/workspace/tsconfig.ts"
import {
  describeLintPreset,
  findExcludedPresets,
  findMissingRequiredPresets,
  type LintPreset,
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
import * as Output from "#terminal/output.ts"
import { INIT_EDITOR_LABELS, INIT_EDITORS, type InitOptionsInput } from "./options.ts"

const describeScriptConflict = (conflict: ScriptConflict) =>
  `\`${conflict.script}\` runs \`${conflict.command}\`. Adamantite would replace it with \`${MANAGED_SCRIPT_COMMANDS[conflict.script]}\`.`

/**
 * Asks which preset to keep of each selected pair that excludes each other, and removes the other
 * preset of the pair.
 */
function keepOneOfExcludedPresets(
  selected: readonly LintPreset[]
): Effect.Effect<readonly LintPreset[], Terminal.QuitError, Prompt.Environment> {
  return Option.match(Array.head(findExcludedPresets(selected)), {
    onNone: () => Effect.succeed(selected),
    onSome: ({ excluded, preset }) =>
      Effect.gen(function* () {
        const kept = yield* Prompt.Select({
          choices: [preset, excluded].map((name) => ({ title: name, value: name })),
          message: `The ${preset} and ${excluded} presets report the same defects. Which one should Adamantite use?`,
        })

        return yield* keepOneOfExcludedPresets(
          selected.filter((name) => name === kept || (name !== preset && name !== excluded))
        )
      }),
  })
}

/**
 * Asks for the lint presets, keeps one preset of each pair that excludes each other, and adds each
 * preset that a selected preset requires.
 */
const promptPresets = Effect.gen(function* () {
  const chosen = yield* Prompt.MultiSelect({
    choices: lintPresets.map((preset) => ({
      description: describeLintPreset(preset),
      title: preset.label,
      value: preset.name,
    })),
    message: "Which presets should Adamantite use with the core preset?",
  })

  const selected = yield* keepOneOfExcludedPresets(chosen)

  const missingPresets = findMissingRequiredPresets(selected)

  for (const { required, requiredBy } of missingPresets) {
    yield* Output.info(`Added the \`${required}\` preset, which \`${requiredBy}\` requires.`)
  }

  return [...missingPresets.map(({ required }) => required), ...selected]
})

export const collectInteractiveInitOptions = Effect.fn("collectInteractiveInitOptions")(function* (
  cwd: string,
  isMonorepo: boolean,
  packageManager: PackageManagerName
) {
  const selectedScripts = yield* Prompt.MultiSelect({
    choices: [
      {
        description: "recommended",
        title: "check - find formatting, lint, and type errors",
        value: "check",
      },
      {
        description: "recommended",
        title: "fix - apply safe lint fixes and format code",
        value: "fix",
      },
      {
        title: isMonorepo
          ? "analyze - find unused code and check monorepo consistency"
          : "analyze - find unused dependencies, exports, and files",
        value: "analyze",
      },
    ],
    message: "Which scripts should Adamantite add to `package.json`?",
  })

  const packageJson = yield* readPackageJson(cwd)
  const conflicts = getConflictingScripts(packageJson, selectedScripts)

  for (const conflict of conflicts) {
    yield* Output.warning(describeScriptConflict(conflict))
  }

  const shouldOverwriteScripts =
    conflicts.length > 0
      ? yield* Prompt.Confirm({
          initial: false,
          message:
            conflicts.length === 1
              ? "Replace this script with Adamantite's command?"
              : "Replace these scripts with Adamantite's commands?",
        })
      : false

  const hasOxlint = checkRunsTool(selectedScripts, "oxlint")
  const selectedPresets = hasOxlint ? yield* promptPresets : []

  const shouldSetupTypescript = yield* Prompt.Confirm({
    initial: true,
    message: "Use an Adamantite TypeScript preset?",
  })

  const typescriptPreset = shouldSetupTypescript
    ? Option.some(
        yield* Prompt.Select<TypeScriptPreset>({
          choices: [
            {
              description: "JSON.parse() returns unknown, not any. Avoid in libraries.",
              title: "Strict types",
              value: "typescript",
            },
            {
              description: "No changes to built-in types. Use for libraries.",
              title: "Strict config",
              value: "tsconfig",
            },
          ],
          message: "Which TypeScript preset should Adamantite use?",
        })
      )
    : Option.none()

  const selectedEditors = yield* Prompt.MultiSelect({
    choices: INIT_EDITORS.map((editor) => ({ title: INIT_EDITOR_LABELS[editor], value: editor })),
    message: "Which editors should Adamantite configure?",
  })

  const shouldInstallExtensions =
    selectedEditors.length > 0
      ? yield* Prompt.Confirm({
          initial: true,
          message: "Install the recommended editor extensions?",
        })
      : false

  const canEnableGitHubActions = checkIsSupportedPackageManager(packageManager)
  const keptConflicts = shouldOverwriteScripts ? [] : conflicts.map((conflict) => conflict.script)

  // The workflow runs the selected scripts that init makes managed. A conflicting script that the
  // user keeps does not run Adamantite, and init accepts the workflow only for a selected script.
  const writtenScripts = selectedScripts.filter((script) => !keptConflicts.includes(script))

  if (hasCICompatibleScripts(writtenScripts) && !canEnableGitHubActions) {
    yield* Output.info(
      `Adamantite cannot generate a GitHub Actions workflow for \`${packageManager}\`. It supports ${listSupportedPackageManagers("conjunction")}.`
    )
  }

  const shouldEnableGitHubActions =
    hasCICompatibleScripts(writtenScripts) && canEnableGitHubActions
      ? yield* Prompt.Confirm({
          initial: true,
          message: "Add a GitHub Actions workflow to run the selected checks?",
        })
      : false

  const shouldSetupAgents = yield* Prompt.Confirm({
    initial: true,
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
