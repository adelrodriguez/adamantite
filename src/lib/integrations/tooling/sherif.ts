import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { definePackageTooling } from "#lib/workspace/tooling-config.ts"

export default definePackageTooling({
  name: "sherif",
  purpose: "the managed monorepo scripts",
  scripts: ["check:monorepo", "fix:monorepo"],
  version: getDependencyVersion("sherif"),
})
