import { definePackageTooling } from "#lib/integrations/tooling/base.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

export default definePackageTooling({
  name: "oxlint-tsgolint",
  purpose: "the managed lint scripts",
  scripts: ["check", "fix"],
  version: getDependencyVersion("oxlint-tsgolint"),
})
