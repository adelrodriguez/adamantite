import type { Integration } from "#lib/integrations/base.ts"

/**
 * The integrations that own a folder in `src/lib/integrations/`. `Setup.apply` writes their managed
 * files and installs their packages, and the assessment runs each one that the selection includes.
 * The integrations that have not moved here yet keep their own setup steps in `init`.
 */
// No integration has moved yet, so the list needs no service.
export const integrations: ReadonlyArray<Integration<never, never>> = []
