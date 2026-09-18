import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { definePackageTooling } from "#lib/workspace/tooling/config.ts"
import { getLegacyMonorepoScriptFindings } from "#lib/workspace/tooling/sherif.ts"

export default definePackageTooling({
  legacyFindings: getLegacyMonorepoScriptFindings,
  // `adamantite analyze` runs Sherif in a detected monorepo.
  monorepoOnlyScripts: ["analyze"],
  name: "sherif",
  purpose: "the managed `analyze` script in a monorepo and the managed monorepo scripts",
  scripts: ["check:monorepo", "fix:monorepo"],
  version: getDependencyVersion("sherif"),
})
