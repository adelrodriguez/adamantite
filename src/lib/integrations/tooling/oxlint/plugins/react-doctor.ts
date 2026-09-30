import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { defineManagedPlugin } from "#lib/workspace/tooling/oxlint.ts"

export default defineManagedPlugin({
  name: "oxlint-plugin-react-doctor",
  preset: "react-doctor",
  version: getDependencyVersion("oxlint-plugin-react-doctor"),
})
