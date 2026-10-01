import { defineManagedPlugin } from "#lib/integrations/tooling/oxlint/plugins/define.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

export default defineManagedPlugin({
  name: "oxlint-plugin-react-doctor",
  preset: "react-doctor",
  version: getDependencyVersion("oxlint-plugin-react-doctor"),
})
