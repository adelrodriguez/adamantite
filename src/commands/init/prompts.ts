import * as Effect from "effect/Effect"
import { hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import {
  getConflictingScripts,
  readPackageJson,
  MANAGED_SCRIPT_COMMANDS,
  type ScriptConflict,
} from "#lib/workspace/package-json.ts"
import { Prompter } from "#terminal/prompter.ts"
import type { InitOptions, InitOptionsInput } from "./options.ts"

const describeScriptConflict = (conflict: ScriptConflict) =>
  `\`${conflict.script}\` is currently \`${conflict.command}\`; Adamantite would replace it with \`${MANAGED_SCRIPT_COMMANDS[conflict.script]}\`.`

export const collectInteractiveInitOptions = Effect.fn("collectInteractiveInitOptions")(function* (
  cwd: string,
  isMonorepo: boolean
) {
  const prompter = yield* Prompter

  const selectedScripts = yield* prompter.multiselect({
    message: "Which scripts do you want to add to your `package.json`?",
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
          ? "Overwrite this existing script with Adamantite's command?"
          : "Overwrite these existing scripts with Adamantite's commands?",
    })
  }

  const hasOxlint = selectedScripts.includes("check") || selectedScripts.includes("fix")
  let selectedPresets: InitOptions["presets"] = []

  if (hasOxlint) {
    selectedPresets = yield* prompter.multiselect({
      message: "Which presets do you want to install? (core is always included)",
      options: [
        {
          hint: "React correctness, JSX accessibility, and render performance rules",
          label: "react",
          value: "react",
        },
        {
          hint: "Next.js pitfalls around scripts, fonts, images, and document/head usage",
          label: "next.js",
          value: "nextjs",
        },
        {
          hint: "Vue 3 correctness rules and deprecated API detection",
          label: "vue",
          value: "vue",
        },
        {
          hint: "Jest test hygiene: focused/disabled tests, matcher and snapshot discipline",
          label: "jest",
          value: "jest",
        },
        {
          hint: "Vitest test hygiene: focused/disabled tests, matcher and snapshot discipline",
          label: "vitest",
          value: "vitest",
        },
        {
          hint: "Node.js callback and CommonJS pitfalls",
          label: "node",
          value: "node",
        },
        {
          hint: "Rejects low-signal escape hatches: unjustified assertions, unknown leaks, module mocks",
          label: "antislop",
          value: "antislop",
        },
      ],
      required: false,
    })
  }

  const shouldSetupTypescript = hasOxlint
    ? yield* prompter.confirm({
        initialValue: true,
        message: isMonorepo
          ? "Adamantite provides a TypeScript preset to enforce strict type-safety. In a monorepo, each package's `tsconfig.json` must extend it. Would you like instructions on how to set it up?"
          : "Adamantite provides a TypeScript preset to enforce strict type-safety. Would you like to use it?",
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
    overwriteScripts: shouldOverwriteScripts,
    presets: selectedPresets,
    scripts: selectedScripts,
    typescript: shouldSetupTypescript,
  } satisfies InitOptionsInput
})
