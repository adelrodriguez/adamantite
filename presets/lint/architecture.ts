import type { OxlintConfig } from "oxlint"
import { PRESET, type PresetIdentity } from "../identity.ts"
import { firstPartyPlugin } from "./plugins/entry.ts"

// Layer maps and import owners belong to the target project, so this preset enables no rules. It
// loads the `adamantite` plugin for a project that configures them without the other rules of
// `strict`, which loads the same plugin.
const config: OxlintConfig = {
  [PRESET]: { module: "adamantite/lint/architecture" } satisfies PresetIdentity,
  jsPlugins: [firstPartyPlugin("adamantite")],
}

export default config
