import type { Script } from "#lib/project/package-json.ts"
import { getAgentsSectionTemplate } from "#lib/integrations/agents/section.macro.ts" with { type: "macro" }
import { SCRIPT_ORDER, checkRunsTool } from "#lib/project/package-json.ts"
import { type SupportedPackageManager, formatRunScript } from "#lib/project/package-manager.ts"
import { CUSTOM_RULES_SECTION } from "#lib/shared/skill.ts"
import { fillTemplate } from "#lib/shared/template.ts"

const agentsSectionTemplate = getAgentsSectionTemplate()

export const ADAMANTITE_AGENTS_START_MARKER = "<!-- ADAMANTITE:START -->"
export const ADAMANTITE_AGENTS_END_MARKER = "<!-- ADAMANTITE:END -->"

interface AgentsSectionOptions {
  readonly isMonorepo: boolean
  readonly packageManager: SupportedPackageManager
  readonly scripts: readonly Script[]
}

function getScriptGuidance(
  packageManager: SupportedPackageManager,
  script: Script,
  isMonorepo: boolean
) {
  const command = formatRunScript(packageManager, script)

  switch (script) {
    case "analyze":
      return `- Run \`${command}\` after changing dependencies, imports, or exports.${isMonorepo ? " It also checks monorepo package consistency." : ""}`
    case "check":
      return `- Run \`${command}\` to catch formatting, lint, and type issues.`
    case "fix":
      return `- Run \`${command}\` to apply safe lint fixes and format code.`
  }
}

/**
 * The Adamantite section of `AGENTS.md`, between its two marker comments.
 */
export function renderAgentsSection({ isMonorepo, packageManager, scripts }: AgentsSectionOptions) {
  const selectedScriptGuidance = SCRIPT_ORDER.flatMap((script) =>
    scripts.includes(script) ? [getScriptGuidance(packageManager, script, isMonorepo)] : []
  )

  // The scripts and customRules values carry their own trailing newline, so an empty value leaves
  // no blank line.
  return fillTemplate(agentsSectionTemplate, {
    customRules: checkRunsTool(scripts, "oxlint")
      ? `- For custom rules, follow the "${CUSTOM_RULES_SECTION}" section and linked guide in the Adamantite skill. Complete its verification and cleanup checks.\n`
      : "",
    end: ADAMANTITE_AGENTS_END_MARKER,
    scripts:
      selectedScriptGuidance.length > 0
        ? [
            "- Prefer the package scripts Adamantite added for this workspace.",
            ...selectedScriptGuidance,
            "",
          ].join("\n")
        : "",
    start: ADAMANTITE_AGENTS_START_MARKER,
  })
}
