import type { OxlintConfig } from "oxlint"

const config: OxlintConfig = {
  plugins: ["node"],
  rules: {
    "node/no-exports-assign": "error",
    "node/no-new-require": "error",
    "node/no-path-concat": "error",
  },
}

export default config
