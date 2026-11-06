import { defineOxlintPlugin } from "#lib/integrations/tooling/oxlint/plugins/base.ts"

export default defineOxlintPlugin({
  name: "oxlint-plugin-react-doctor",
  preset: "react-doctor",
  runtime: { _tag: "JavaScript" },
})
