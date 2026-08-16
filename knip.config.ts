import type { KnipConfig } from "knip"
import analyze from "./presets/analyze.ts"

const config: KnipConfig = {
  ...analyze,
  entry: ["presets/**/*.ts", "scripts/*.ts"],
  ignore: ["presets/lint/antislop/plugin.d.mts"],
  rules: {
    ...analyze.rules,
    devDependencies: "off",
    optionalPeerDependencies: "off",
  },
}

export default config
