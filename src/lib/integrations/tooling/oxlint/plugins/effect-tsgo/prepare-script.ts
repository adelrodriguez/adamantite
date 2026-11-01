import type { PackageJson } from "type-fest"
import type { Finding } from "#lib/integrations/base.ts"

const PREPARE_SCRIPT = "prepare"
const PREPARE_COMMAND = "adamantite prepare"

/**
 * A finding when the `prepare` script still runs `adamantite prepare`. The command patched Oxlint
 * for the effect preset. The toolchain proxy replaced the patch, so the command does nothing, and a
 * later release removes it.
 */
export function assessPrepareScript(packageJson: PackageJson, integration: string): Finding[] {
  const command = packageJson.scripts?.[PREPARE_SCRIPT]

  if (command?.includes(PREPARE_COMMAND) !== true) {
    return []
  }

  return [
    {
      currentState: `The \`${PREPARE_SCRIPT}\` script (\`${command}\`) still runs \`${PREPARE_COMMAND}\`, which does nothing.`,
      goal: [
        `Remove \`${PREPARE_COMMAND}\` from the \`${PREPARE_SCRIPT}\` script in \`package.json\`. Keep the other commands of the script, and remove the parentheses and \`&&\` that \`adamantite init\` added around them. Delete the script when nothing else is left.`,
      ],
      id: "legacy-adamantite-prepare",
      integration,
      notes: [
        "Adamantite runs Oxlint with the Effect builds of the binding and oxlint-tsgolint, so nothing patches `node_modules` after an install.",
        "A later release removes `adamantite prepare`, and a `prepare` script that still runs it then fails the install.",
      ],
      title: "Legacy adamantite prepare step",
    },
  ]
}
