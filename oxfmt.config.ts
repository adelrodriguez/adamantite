import { defineConfig } from "oxfmt"
import format from "./presets/format.ts"

export default defineConfig({
  ...format,
  // Generated vendored bundle; see scripts/vendor-plugins.ts.
  ignorePatterns: ["presets/lint/antislop/plugin.mjs", "presets/lint/antislop/plugin.d.mts"],
})
