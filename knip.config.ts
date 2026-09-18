import type { KnipConfig } from "knip"
import analyze from "./presets/analyze.ts"

export default {
  ...analyze,
  entry: ["presets/**/*.ts", "scripts/*.ts"],
  ignore: ["presets/lint/vendor/**"],
  // The devDependencies rule is off here, so the preset's Sherif ignore matches nothing.
  ignoreDependencies: [],
  rules: {
    ...analyze.rules,
    devDependencies: "off",
    optionalPeerDependencies: "off",
  },
} satisfies KnipConfig
