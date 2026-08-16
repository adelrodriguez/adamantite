import { defineConfig } from "oxlint"
import antislop from "./presets/lint/antislop.ts"
import core from "./presets/lint/core.ts"
import node from "./presets/lint/node.ts"

export default defineConfig({
  extends: [core, node, antislop],
  // Generated vendored bundle and its declaration; see scripts/vendor-anti-slop.ts.
  ignorePatterns: ["presets/lint/antislop/plugin.mjs", "presets/lint/antislop/plugin.d.mts"],
  options: {
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    {
      files: ["src/lib/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["#terminal/*"],
                message:
                  "Terminal interaction belongs to commands/ and index.ts; lib code returns data for commands to render.",
              },
            ],
          },
        ],
      },
    },
  ],
})
