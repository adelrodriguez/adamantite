import type { KnipConfig } from "knip"
import analyze, { ignoreDependencies } from "./presets/analyze.ts"

export default {
  ...analyze,
  entry: ["presets/**/*.ts", "scripts/*.ts"],
  ignore: ["presets/lint/vendor/**", "src/__tests__/presets/fixtures/**"],
  ignoreDependencies: [
    ...ignoreDependencies.effect,
    // Nothing imports it. The pin keeps npm from resolving `@effect/platform-node`'s `^4.0.0` range
    // to a release whose peer `effect` version differs from the pinned `effect` (#511).
    "@effect/platform-node-shared",
  ],
  rules: {
    ...analyze.rules,
    devDependencies: "off",
    optionalPeerDependencies: "off",
  },
} satisfies KnipConfig
