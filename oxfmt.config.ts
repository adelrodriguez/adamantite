import { defineConfig } from "oxfmt"
import format from "./presets/format.ts"

export default defineConfig({
  ...format,
  ignorePatterns: [
    // Vendored plugin bundles are entirely generated; see scripts/vendor-plugins.ts.
    "presets/lint/vendor/",
    // Rule fixtures keep the exact syntax of each case, such as redundant parentheses.
    "src/__tests__/presets/fixtures/",
  ],
})
