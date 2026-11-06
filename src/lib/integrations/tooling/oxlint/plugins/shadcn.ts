import { defineOxlintPlugin } from "#lib/integrations/tooling/oxlint/plugins/base.ts"

export default defineOxlintPlugin({
  name: "@shadcn/lint",
  preset: "shadcn",
  runtime: { _tag: "JavaScript" },
})
