import knip from "#lib/integrations/tooling/knip.ts"
import { defineLegacyJsonConfigMigration } from "#lib/migrations/legacy-json-config.ts"
import { toKnipTsConfigContent } from "#lib/workspace/knip-config.ts"

export default defineLegacyJsonConfigMigration({
  displayName: "Knip",
  id: "legacy-knip-json",
  integration: knip,
  serialize: toKnipTsConfigContent,
  title: "Legacy Knip JSON config",
})
