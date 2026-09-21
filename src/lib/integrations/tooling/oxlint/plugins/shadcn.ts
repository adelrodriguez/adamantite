import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { defineManagedPlugin } from "#lib/workspace/tooling/oxlint.ts"

export default defineManagedPlugin({
  name: "@shadcn/lint",
  preset: "shadcn",
  version: getDependencyVersion("@shadcn/lint"),
})
