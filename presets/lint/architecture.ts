import type { OxlintConfig } from "oxlint"
import { firstPartyPlugin } from "./plugins/entry.ts"

// Layer maps and import owners belong to the target project, so this preset enables no rules.
const config: OxlintConfig = {
  jsPlugins: [firstPartyPlugin("adamantite")],
}

export default config
