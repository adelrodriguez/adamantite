import { defineConfig } from "oxfmt"
import format from "./presets/format.ts"

export default defineConfig({
  ...format,
  // Vendored plugin bundles are entirely generated; see scripts/vendor-plugins.ts.
  ignorePatterns: ["presets/lint/vendor/"],
})
