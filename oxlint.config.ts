import { defineConfig } from "oxlint"
import antislop from "./presets/lint/antislop.ts"
import core, { ignorePatterns } from "./presets/lint/core.ts"
import node from "./presets/lint/node.ts"

const TERMINAL_IMPORTS = {
  group: ["#terminal/*"],
  message:
    "Terminal interaction belongs to commands/ and index.ts; lib code returns data for commands to render.",
}

const LIB_LAYER_MESSAGE =
  'Lib layers import only from lower layers: shared, then workspace and execution, then integrations, then assessment. See "Lib layers" in docs/architecture.md.'

export default defineConfig({
  extends: [core, node, antislop],
  ignorePatterns: [
    ...ignorePatterns,
    // Vendored plugin bundles are entirely generated; see scripts/vendor-plugins.ts.
    "presets/lint/vendor/",
    // Rule fixtures break rules on purpose; see src/__tests__/presets/rule-fixtures.ts.
    "src/__tests__/presets/fixtures/",
  ],
  options: {
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    {
      files: ["src/lib/shared/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              TERMINAL_IMPORTS,
              {
                group: [
                  "#lib/workspace/**",
                  "#lib/execution/**",
                  "#lib/integrations/**",
                  "#lib/assessment/**",
                ],
                message: LIB_LAYER_MESSAGE,
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/lib/workspace/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              TERMINAL_IMPORTS,
              {
                group: ["#lib/execution/**", "#lib/integrations/**", "#lib/assessment/**"],
                message: LIB_LAYER_MESSAGE,
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/lib/execution/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              TERMINAL_IMPORTS,
              {
                group: ["#lib/workspace/**", "#lib/integrations/**", "#lib/assessment/**"],
                message: LIB_LAYER_MESSAGE,
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/lib/integrations/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              TERMINAL_IMPORTS,
              {
                group: ["#lib/assessment/**"],
                message: LIB_LAYER_MESSAGE,
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/lib/assessment/**/*.ts"],
      rules: {
        "no-restricted-imports": ["error", { patterns: [TERMINAL_IMPORTS] }],
      },
    },
  ],
})
