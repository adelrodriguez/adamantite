import shadcn from "#lib/integrations/tooling/oxlint/plugins/shadcn.ts"

/**
 * Every managed plugin. Init installs the ones whose preset is selected, and doctor and update keep
 * them on their pinned versions.
 */
export const managedPlugins = [shadcn] as const
