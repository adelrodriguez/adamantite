import { definePackageTooling } from "#lib/integrations/tooling/base.ts"
import { getScriptsThatRun } from "#lib/project/package-json.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

export default definePackageTooling({
  name: "tsrs",
  purpose: "the type-aware rules of the managed lint scripts",
  scripts: getScriptsThatRun("oxlint"),
  version: getDependencyVersion("tsrs"),
})
