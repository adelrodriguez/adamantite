import { defineConfig } from "oxlint"
import core from "./presets/lint/core.ts"
import node from "./presets/lint/node.ts"

export default defineConfig({
  extends: [core, node],
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
