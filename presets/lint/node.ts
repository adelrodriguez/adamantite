import type { OxlintConfig } from "oxlint"

export default {
  plugins: ["node"],
  rules: {
    "node/no-exports-assign": "error",
    "node/no-new-require": "error",
    "node/no-path-concat": "error",
  },
} as const satisfies OxlintConfig
