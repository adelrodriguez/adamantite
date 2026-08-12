import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import { defineLegacyJsonConfigMigration } from "#lib/migrations/legacy-json-config.ts"
import { toOxfmtTsConfigContent } from "#lib/workspace/oxfmt-config.ts"

export default defineLegacyJsonConfigMigration({
  displayName: "Oxfmt",
  id: "legacy-oxfmt-json",
  integration: oxfmt,
  serialize: toOxfmtTsConfigContent,
  title: "Legacy oxfmt JSON config",
})
