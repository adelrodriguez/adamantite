import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import type { Finding } from "#lib/integrations/base.ts"
import { readPackageJson, writePackageJson } from "#lib/workspace/package-json.ts"

const PREPARE_SCRIPT = "prepare"
// Package managers run the `prepare` script after a bare install, which restores unpatched binaries.
const PREPARE_COMMAND = "adamantite prepare"

function checkRunsPrepare(command: string | undefined) {
  return command?.includes(PREPARE_COMMAND) ?? false
}

/**
 * A finding when the `prepare` script does not run `adamantite prepare`.
 */
export function assessPrepareScript(packageJson: PackageJson, integration: string): Finding[] {
  const command = packageJson.scripts?.[PREPARE_SCRIPT]

  if (checkRunsPrepare(command)) {
    return []
  }

  return [
    {
      currentState:
        command === undefined
          ? `\`package.json\` has no \`${PREPARE_SCRIPT}\` script, so nothing patches Oxlint for the \`effecttsgo\` rules after an install.`
          : `The \`${PREPARE_SCRIPT}\` script (\`${command}\`) does not run \`${PREPARE_COMMAND}\`.`,
      goal: [
        `Make the \`${PREPARE_SCRIPT}\` script in \`package.json\` run \`${PREPARE_COMMAND}\`. Put it first, then \`&&\`, then the existing commands in parentheses, such as \`${PREPARE_COMMAND} && (husky || true)\`. A command such as \`cd ..\` then cannot move it out of the project directory, and a fallback such as \`|| true\` cannot hide a failed patch.`,
        `Run \`${PREPARE_COMMAND}\` once, so the installed Oxlint, oxlint-tsgolint, and TypeScript binaries are patched.`,
      ],
      id: "missing-effect-tsgo-prepare",
      integration,
      notes: [
        "Without the patch, Oxlint stops with `Unknown plugin: 'effecttsgo'`.",
        "Package managers run `prepare` after a bare install, such as `npm install` or `npm ci`, which restores the unpatched binaries. `adamantite init` and `adamantite update` patch after the installs that they run.",
        "A production-only install, such as `npm ci --omit=dev`, also runs `prepare` but does not install Adamantite. Use `--ignore-scripts` for those installs.",
      ],
      title: "Missing adamantite prepare step",
    },
  ]
}

/**
 * Make the `prepare` script run `adamantite prepare`. An existing script keeps its commands, and
 * `adamantite prepare` runs before them: a command such as `cd ..` would otherwise move it out of
 * the project directory. The parentheses keep a fallback such as `|| true` in the existing script
 * from hiding a failed patch.
 */
export const updatePrepareScript = Effect.fn("updatePrepareScript")(function* (cwd: string) {
  const packageJson = yield* readPackageJson(cwd)
  const command = packageJson.scripts?.[PREPARE_SCRIPT]?.trim()

  if (checkRunsPrepare(command)) {
    return "present" as const
  }

  const hasCommand = command !== undefined && command !== ""

  packageJson.scripts = {
    ...packageJson.scripts,
    [PREPARE_SCRIPT]: hasCommand ? `${PREPARE_COMMAND} && (${command})` : PREPARE_COMMAND,
  }
  yield* writePackageJson(cwd, packageJson)

  return hasCommand ? ("merged" as const) : ("added" as const)
})
