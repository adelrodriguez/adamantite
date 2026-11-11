import { defineConfig } from "oxfmt"
import format from "./presets/format.ts"

export default defineConfig({
  ...format,
  ignorePatterns: [
    // Vendored plugin bundles are entirely generated; see scripts/vendor-plugins.ts.
    "presets/lint/vendor/",
    // The vendored ts-reset declarations are generated; see scripts/vendor-ts-reset.ts.
    "presets/typescript/vendor/",
    // Rule fixtures keep the exact syntax of each case, such as redundant parentheses.
    "src/__tests__/presets/fixtures/",
  ],
})
