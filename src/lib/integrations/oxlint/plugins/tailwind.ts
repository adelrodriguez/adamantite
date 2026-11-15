import { defineOxlintPlugin, JavaScriptRuntime } from "#lib/integrations/oxlint/plugins/base.ts"

export default defineOxlintPlugin({
  name: "@shadcn/lint",
  runtime: new JavaScriptRuntime(),
})
