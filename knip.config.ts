import type { KnipConfig } from "knip"
import analyze from "./presets/analyze.ts"

export default {
  ...analyze,
  entry: ["presets/**/*.ts", "scripts/*.ts"],
  ignore: ["presets/lint/vendor/**", "src/__tests__/presets/fixtures/**"],
  rules: {
    ...analyze.rules,
    devDependencies: "off",
    optionalPeerDependencies: "off",
  },
} satisfies KnipConfig
