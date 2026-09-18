import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { definePackageTooling } from "#lib/workspace/tooling/config.ts"
import { getLegacyMonorepoScriptFindings } from "#lib/workspace/tooling/sherif.ts"

export default definePackageTooling({
  legacyFindings: getLegacyMonorepoScriptFindings,
  monorepoOnly: true,
  name: "sherif",
  purpose: "the managed `analyze` script in a monorepo",
  scripts: ["analyze"],
  version: getDependencyVersion("sherif"),
})
