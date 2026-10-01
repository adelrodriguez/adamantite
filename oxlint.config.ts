import { defineConfig, type OxlintOverride } from "oxlint"
import antislop from "./presets/lint/antislop.ts"
import core, { ignorePatterns } from "./presets/lint/core.ts"
import node from "./presets/lint/node.ts"

const TERMINAL_IMPORTS = {
  group: ["#terminal/*"],
  message:
    "Terminal interaction belongs to commands/ and index.ts; lib code returns data for commands to render.",
}

// The lib layers that each layer must not import. A layer imports only from the layers below it, and
// `assessment` is the top layer.
const LIB_LAYER_IMPORTS = {
  execution: ["workspace", "integrations", "assessment"],
  integrations: ["assessment"],
  shared: ["workspace", "execution", "integrations", "assessment"],
  workspace: ["execution", "integrations", "assessment"],
}

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
      files: ["src/lib/**/*.ts"],
      rules: { "no-restricted-imports": ["error", { patterns: [TERMINAL_IMPORTS] }] },
    },
    ...Object.entries(LIB_LAYER_IMPORTS).map(([layer, forbidden]): OxlintOverride => ({
      files: [`src/lib/${layer}/**/*.ts`],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              TERMINAL_IMPORTS,
              {
                group: forbidden.map((target) => `#lib/${target}/**`),
                message:
                  "Lib layers depend in one direction: shared, then workspace and execution, then integrations, then assessment. Import only from a lower layer.",
              },
            ],
          },
        ],
      },
    })),
  ],
})
