import { defineConfig } from "oxfmt"
import format from "./presets/format.ts"

export default defineConfig({
  ...format,
  ignorePatterns: [
    // Rule fixtures keep the exact syntax of each case, such as redundant parentheses.
    "src/__tests__/presets/fixtures/",
  ],
})
