import { defineManagedPlugin } from "#lib/integrations/tooling/oxlint/plugins/define.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

export default defineManagedPlugin({
  name: "@shadcn/lint",
  preset: "shadcn",
  version: getDependencyVersion("@shadcn/lint"),
})
