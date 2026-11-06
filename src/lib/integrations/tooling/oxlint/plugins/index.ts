import effectTsgo from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/index.ts"
import reactDoctor from "#lib/integrations/tooling/oxlint/plugins/react-doctor.ts"
import shadcn from "#lib/integrations/tooling/oxlint/plugins/shadcn.ts"

/**
 * Every Oxlint plugin definition. Both runtime resolution and management use this registry. The
 * Oxlint entry loads it from source, so no definition imports a macro module. `plugins/managed.ts`
 * adds the versions.
 */
export const oxlintPlugins = [shadcn, reactDoctor, effectTsgo] as const
