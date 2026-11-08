import type { PackageManagerName } from "nypm"
import * as Effect from "effect/Effect"
import { CodingAgents, codingAgents } from "#lib/execution/coding-agents.ts"
import { type SkillFolder, skillFolders } from "#lib/execution/skill.ts"
import { hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import {
  checkIsSupportedPackageManager,
  getConflictingScripts,
  readPackageJson,
  MANAGED_SCRIPT_COMMANDS,
  type ScriptConflict,
} from "#lib/workspace/package-json.ts"
import { Prompter } from "#terminal/prompter.ts"
import type { InitOptions, InitOptionsInput } from "./options.ts"

const AGENTS_MD = "agents-md"

// Most agents read `.agents/skills`, so the skill goes there unless the user deselects it.
const DEFAULT_SKILL_FOLDER: SkillFolder = ".agents/skills"

type AgentSetupChoice = typeof AGENTS_MD | SkillFolder

const agentNames = new Intl.ListFormat("en", { type: "conjunction" })

const describeSkillFolder = (folder: SkillFolder) => {
  const names = codingAgents
    .filter((agent) => agent.skillsFolder === folder)
    .map((agent) => agent.name)

  return `${agentNames.format(names)} ${names.length === 1 ? "reads" : "read"} this folder.`
}

const describeScriptConflict = (conflict: ScriptConflict) =>
  `\`${conflict.script}\` runs \`${conflict.command}\`. Init would replace it with \`${MANAGED_SCRIPT_COMMANDS[conflict.script]}\`.`

export const collectInteractiveInitOptions = Effect.fn("collectInteractiveInitOptions")(function* (
  cwd: string,
  isMonorepo: boolean,
  packageManager: PackageManagerName
) {
  const prompter = yield* Prompter

  const selectedScripts = yield* prompter.multiselect({
    message: "Which scripts should init add to `package.json`?",
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
  })

  const packageJson = yield* readPackageJson(cwd)
  const conflicts = getConflictingScripts(packageJson, selectedScripts)
  let shouldOverwriteScripts = false

  if (conflicts.length > 0) {
    for (const conflict of conflicts) {
      yield* prompter.log.warning(describeScriptConflict(conflict))
    }

    shouldOverwriteScripts = yield* prompter.confirm({
      initialValue: false,
      message:
        conflicts.length === 1
          ? "Replace this script with Adamantite's command?"
          : "Replace these scripts with Adamantite's commands?",
    })
  }

  const hasOxlint = selectedScripts.includes("check") || selectedScripts.includes("fix")
  let selectedPresets: InitOptions["presets"] = []

  if (hasOxlint) {
    selectedPresets = yield* prompter.multiselect({
      message: "Which presets should init use with the core preset?",
      options: [
        {
          hint: "Check React code, JSX accessibility, and performance.",
          label: "react",
          value: "react",
        },
        {
          hint: "Keep state, effect, and memo hooks in hook files. Installs oxlint-plugin-react-doctor and selects the react preset.",
          label: "react-strict",
          value: "react-strict",
        },
        {
          hint: "Use queryOptions() and keep query data out of state.",
          label: "tanstack",
          value: "tanstack",
        },
        {
          hint: "Check Next.js scripts, fonts, images, and head usage.",
          label: "next.js",
          value: "nextjs",
        },
        {
          hint: "Check Vue 3 code for errors and deprecated APIs.",
          label: "vue",
          value: "vue",
        },
        {
          hint: "Find effects that never run. Installs @effect/tsgo.",
          label: "effect",
          value: "effect",
        },
        {
          hint: "Find focused or skipped tests and check assertions.",
          label: "jest",
          value: "jest",
        },
        {
          hint: "Find focused or skipped tests and check assertions.",
          label: "vitest",
          value: "vitest",
        },
        {
          hint: "Check Node.js callbacks and CommonJS modules.",
          label: "node",
          value: "node",
        },
        {
          hint: "Check the layer maps and import owners you define.",
          label: "architecture",
          value: "architecture",
        },
        {
          hint: "Limit type assertions, deep destructuring, and TODOs.",
          label: "strict",
          value: "strict",
        },
        {
          hint: "Ban module mocks, Reflect.get, and unknown parameters.",
          label: "antislop",
          value: "antislop",
        },
        {
          hint: "Check Tailwind v4 classes. Installs @shadcn/lint.",
          label: "tailwind",
          value: "tailwind",
        },
      ],
      required: false,
    })

    if (selectedPresets.includes("react-strict") && !selectedPresets.includes("react")) {
      selectedPresets = ["react", ...selectedPresets]
      yield* prompter.log.info("Added the `react` preset, which `react-strict` requires.")
    }
  }

  const shouldSetupTypescript = hasOxlint
    ? yield* prompter.confirm({
        initialValue: true,
        message: isMonorepo
          ? "Show how to use the TypeScript preset in each workspace package?"
          : "Use the Adamantite TypeScript preset?",
      })
    : false

  const selectedEditors = yield* prompter.multiselect({
    message: "Which editors should init configure?",
    options: [
      { label: "VS Code / Cursor / Windsurf", value: "vscode" },
      { label: "Zed", value: "zed" },
    ],
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

  if (hasCICompatibleScripts(selectedScripts) && !canEnableGitHubActions) {
    yield* prompter.log.info(
      `Adamantite cannot generate a GitHub Actions workflow for \`${packageManager}\`. It supports bun, deno, npm, pnpm, and yarn.`
    )
  }

  const shouldEnableGitHubActions =
    hasCICompatibleScripts(selectedScripts) && canEnableGitHubActions
      ? yield* prompter.confirm({
          message: "Add a GitHub Actions workflow to run the selected checks?",
        })
      : false

  const installedAgents = yield* (yield* CodingAgents).detectInstalled(cwd)
  const agentSetup = yield* prompter.multiselect<AgentSetupChoice>({
    initialValues: [
      AGENTS_MD,
      ...skillFolders.filter(
        (folder) =>
          folder === DEFAULT_SKILL_FOLDER
          || installedAgents.some((agent) => agent.skillsFolder === folder)
      ),
    ],
    message: "What should init add for coding agents?",
    options: [
      {
        hint: "Tell agents which scripts to run and when to run Doctor.",
        label: "AGENTS.md section",
        value: AGENTS_MD,
      },
      ...skillFolders.map((folder) => ({
        hint: describeSkillFolder(folder),
        label: `Skill in ${folder}`,
        value: folder,
      })),
    ],
    required: false,
  })

  return {
    agents: agentSetup.includes(AGENTS_MD),
    editors: selectedEditors,
    githubActions: shouldEnableGitHubActions,
    installExtensions: shouldInstallExtensions,
    overwriteScripts: shouldOverwriteScripts,
    presets: selectedPresets,
    scripts: selectedScripts,
    skillFolders: agentSetup.filter((choice) => choice !== AGENTS_MD),
    typescript: shouldSetupTypescript,
  } satisfies InitOptionsInput
})
