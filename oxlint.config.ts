import { defineConfig } from "oxlint"
import antislop from "./presets/lint/antislop.ts"
import core, { ignorePatterns } from "./presets/lint/core.ts"
import node from "./presets/lint/node.ts"

export default defineConfig({
  extends: [core, node, antislop],
  ignorePatterns: [
    ...ignorePatterns,
    // Vendored plugin bundles are entirely generated; see scripts/vendor-plugins.ts.
    "presets/lint/vendor/",
  ],
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
