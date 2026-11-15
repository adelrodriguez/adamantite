import type { Integration } from "#lib/integrations/base.ts"
import vscode from "#lib/integrations/vscode/index.ts"

/**
 * The integrations that own a folder in `src/lib/integrations/`. `Setup.apply` writes their managed
 * files and installs their packages, and the assessment runs each one that the selection includes.
 * The integrations that have not moved here yet keep their own setup steps in `init`.
 */
export const integrations = [vscode] as const satisfies readonly Integration[]
