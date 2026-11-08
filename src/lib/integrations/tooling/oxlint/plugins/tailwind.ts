import {
  defineOxlintPlugin,
  JavaScriptRuntime,
} from "#lib/integrations/tooling/oxlint/plugins/base.ts"

export default defineOxlintPlugin({
  name: "@shadcn/lint",
  runtime: new JavaScriptRuntime(),
})
