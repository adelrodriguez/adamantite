import { defineConfig } from "oxfmt"
import format from "./presets/format.ts"

export default defineConfig({
  ...format,
  // Generated vendored bundle; see scripts/vendor-anti-slop.ts.
  ignorePatterns: ["presets/lint/antislop/plugin.mjs", "presets/lint/antislop/plugin.d.mts"],
})
