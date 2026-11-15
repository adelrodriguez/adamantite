import { defineOxlintPlugin, JavaScriptRuntime } from "#lib/integrations/oxlint/plugins/base.ts"

export default defineOxlintPlugin({
  name: "oxlint-plugin-react-doctor",
  runtime: new JavaScriptRuntime(),
})
