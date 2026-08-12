import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { definePackageTooling } from "#lib/workspace/tooling/config.ts"

export default definePackageTooling({
  name: "oxlint-tsgolint",
  purpose: "the managed lint scripts",
  scripts: ["check", "fix"],
  version: getDependencyVersion("oxlint-tsgolint"),
})
