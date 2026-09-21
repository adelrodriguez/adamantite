import shadcn from "#lib/integrations/tooling/oxlint/plugins/shadcn.ts"

/**
 * Every managed plugin. Init installs the ones whose preset is selected. Doctor and update keep a
 * plugin on its pinned version only while `oxlint.config.ts` imports its preset.
 */
export const managedPlugins = [shadcn] as const
