import type { PackageManagerName } from "nypm"
import * as Effect from "effect/Effect"
import { CodingAgents, codingAgents } from "#lib/execution/coding-agents.ts"
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
        label: "check - check formatting, lint issues, and type errors",
        value: "check",
      },
      {
        hint: "recommended",
        label: "fix - apply safe lint fixes and format code",
        value: "fix",
      },
      {
        label: isMonorepo
          ? "analyze - check monorepo consistency and find unused code with Sherif and Knip"
          : "analyze - find unused dependencies, exports, and files with Knip",
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
      message: "Which presets should init configure? The core preset is always included.",
      options: [
        {
          hint: "Check React code, JSX accessibility, and rendering performance.",
          label: "react",
          value: "react",
        },
        {
          hint: "Keep state, effect, and memoization hooks in hook modules. Find React state and effect mistakes. Init installs oxlint-plugin-react-doctor and selects the react preset.",
          label: "react-strict",
          value: "react-strict",
        },
        {
          hint: "Define queries once with queryOptions(), reuse them in route loaders, and avoid copying query data into state.",
          label: "tanstack",
          value: "tanstack",
        },
        {
          hint: "Check Next.js scripts, fonts, images, and document and head usage.",
          label: "next.js",
          value: "nextjs",
        },
        {
          hint: "Check Vue 3 code for errors and deprecated APIs.",
          label: "vue",
          value: "vue",
        },
        {
          hint: "Find unhandled errors and effects that never run. Init installs @effect/tsgo.",
          label: "effect",
          value: "effect",
        },
        {
          hint: "Find focused or disabled Jest tests and check matchers and snapshots.",
          label: "jest",
          value: "jest",
        },
        {
          hint: "Find focused or disabled Vitest tests and check matchers and snapshots.",
          label: "vitest",
          value: "vitest",
        },
        {
          hint: "Check Node.js callbacks and CommonJS modules.",
          label: "node",
          value: "node",
        },
        {
          hint: "Check layer dependencies and package imports with rules you configure for your project.",
          label: "architecture",
          value: "architecture",
        },
        {
          hint: "Check for deep or wide destructuring and type assertions outside tests.",
          label: "strict",
          value: "strict",
        },
        {
          hint: "Check type assertions, unknown types, and module mocks with anti-slop rules.",
          label: "antislop",
          value: "antislop",
        },
        {
          hint: "Check Tailwind v4 classes and component styles against your design system. Init installs @shadcn/lint.",
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

  const shouldAddAgentsGuidance = yield* prompter.confirm({
    initialValue: true,
    message: "Add project check instructions to AGENTS.md for coding agents?",
  })

  const installedAgents = yield* (yield* CodingAgents).detectInstalled(cwd)
  const selectedSkillAgents = yield* prompter.multiselect({
    initialValues: codingAgents
      .filter((agent) => installedAgents.some((installed) => installed.command === agent.command))
      .map((agent) => agent.skillsAgent),
    message: "Which coding agents should receive the Adamantite skill?",
    options: codingAgents.map((agent) => ({
      hint: agent.skillsFolder,
      label: agent.name,
      value: agent.skillsAgent,
    })),
    required: false,
  })

  return {
    agents: shouldAddAgentsGuidance,
    editors: selectedEditors,
    githubActions: shouldEnableGitHubActions,
    installExtensions: shouldInstallExtensions,
    overwriteScripts: shouldOverwriteScripts,
    presets: selectedPresets,
    scripts: selectedScripts,
    skillAgents: selectedSkillAgents,
    typescript: shouldSetupTypescript,
  } satisfies InitOptionsInput
})
