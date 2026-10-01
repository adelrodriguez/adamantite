import { definePackageTooling } from "#lib/integrations/tooling/base.ts"
import { getLegacyMonorepoScriptFindings } from "#lib/integrations/tooling/sherif/legacy-scripts.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

export default definePackageTooling({
  legacyFindings: getLegacyMonorepoScriptFindings,
  monorepoOnly: true,
  name: "sherif",
  purpose: "the managed `analyze` script in a monorepo",
  scripts: ["analyze"],
  version: getDependencyVersion("sherif"),
})
