import { defineOxlintPlugin } from "#lib/integrations/tooling/oxlint/plugins/base.ts"

export default defineOxlintPlugin({
  name: "oxlint-plugin-react-doctor",
  runtime: { _tag: "JavaScript" },
})
