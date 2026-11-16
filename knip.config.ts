import type { KnipConfig } from "knip"
import analyze, { ignoreDependencies } from "./presets/analyze.ts"

export default {
  ...analyze,
  entry: ["presets/**/*.ts", "scripts/*.ts"],
  ignore: ["src/__tests__/presets/fixtures/**"],
  ignoreDependencies: ignoreDependencies.effect,
  rules: {
    ...analyze.rules,
    devDependencies: "off",
    optionalPeerDependencies: "off",
  },
} satisfies KnipConfig
