import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { toOxfmtTsConfigContent } from "#lib/workspace/oxfmt-config.ts"
import { defineConfigTooling } from "#lib/workspace/tooling-config.ts"

export default defineConfigTooling({
  configContent: () => toOxfmtTsConfigContent(),
  configFiles: {
    config: "oxfmt.config.ts",
    legacyConfigs: [".oxfmtrc.json", ".oxfmtrc.jsonc"],
  },
  migrationId: "legacy-oxfmt-json",
  name: "oxfmt",
  purpose: "the managed `format` script",
  scripts: ["format"],
  version: getDependencyVersion("oxfmt"),
})
