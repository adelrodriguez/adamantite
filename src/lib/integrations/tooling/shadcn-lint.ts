import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { definePackageTooling } from "#lib/workspace/tooling/config.ts"

export default definePackageTooling({
  lintPreset: "shadcn",
  name: "@shadcn/lint",
  purpose: "the `adamantite/lint/shadcn` preset",
  scripts: ["check", "fix"],
  version: getDependencyVersion("@shadcn/lint"),
})
