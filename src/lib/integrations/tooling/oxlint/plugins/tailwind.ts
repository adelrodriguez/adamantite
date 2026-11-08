import { defineOxlintPlugin } from "#lib/integrations/tooling/oxlint/plugins/base.ts"

export default defineOxlintPlugin({
  name: "@shadcn/lint",
  runtime: { _tag: "JavaScript" },
})
