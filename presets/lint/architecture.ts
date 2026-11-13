import type { OxlintConfig } from "oxlint"

// The source and dist trees use different extensions. Match this module so Oxlint can load
// the same first-party plugin from either tree.
const PLUGIN_EXTENSION = import.meta.url.endsWith(".ts") ? "ts" : "js"

// Layer maps and import owners belong to the target project, so this preset enables no rules.
const config: OxlintConfig = {
  jsPlugins: [
    {
      name: "adamantite",
      specifier: new URL(`plugins/index.${PLUGIN_EXTENSION}`, import.meta.url).href,
    },
  ],
}

export default config
