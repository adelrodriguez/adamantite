import type { KnipConfig } from "knip"
import analyze from "./presets/analyze.ts"

export default {
  ...analyze,
  entry: ["presets/**/*.ts", "scripts/*.ts"],
  ignore: ["presets/lint/vendor/**", "src/__tests__/presets/fixtures/**"],
  // Not imported. It pins the version that @effect/platform-node would otherwise resolve through
  // a caret range, so a partial Effect release cannot break `npm install adamantite`.
  ignoreDependencies: ["@effect/platform-node-shared"],
  rules: {
    ...analyze.rules,
    devDependencies: "off",
    optionalPeerDependencies: "off",
  },
} satisfies KnipConfig
