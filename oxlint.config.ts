import { defineConfig } from "oxlint"
import antislop from "./presets/lint/antislop.ts"
import core, { ignorePatterns } from "./presets/lint/core.ts"
import effect from "./presets/lint/effect.ts"
import node from "./presets/lint/node.ts"
import vitest from "./presets/lint/vitest.ts"

const TERMINAL_IMPORTS = {
  group: ["#terminal/*"],
  message:
    "Terminal interaction belongs to commands/ and index.ts; lib code returns data for commands to render.",
}

// Parent-relative paths would skip the `#lib/...` layer patterns below. `version.macro.ts` reads the
// root `package.json`, which has no alias.
const PARENT_RELATIVE_IMPORTS = {
  group: ["../**", "!../../../package.json"],
  message: "Import other lib modules through `#lib/...`, so the lib layer rules apply.",
}

const LIB_LAYER_MESSAGE =
  'Lib layers import only from lower layers: shared, then workspace and execution, then integrations, then assessment. See "Lib layers" in docs/architecture.md.'

export default defineConfig({
  extends: [core, node, antislop, effect],
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
    // The vitest preset runs on this repository's tests, so `pnpm run check` fails when a preset
    // rule makes some test code impossible to write.
    {
      files: ["**/*.test.ts"],
      plugins: vitest.plugins,
      rules: {
        ...vitest.rules,
        // Describe titles name the service or error class under test, such as `NodeVersionResolver`.
        "vitest/prefer-lowercase-title": ["error", { ignore: ["describe"] }],
        // `RuleTester` from `oxlint/plugins-dev` declares its own `describe` and `it` blocks, so
        // `tester.run` is a test, not setup code.
        "vitest/require-hook": ["error", { allowedFunctionCalls: ["tester.run"] }],
      },
    },
    {
      files: ["src/lib/shared/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              TERMINAL_IMPORTS,
              PARENT_RELATIVE_IMPORTS,
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
              PARENT_RELATIVE_IMPORTS,
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
              PARENT_RELATIVE_IMPORTS,
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
              PARENT_RELATIVE_IMPORTS,
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
        "no-restricted-imports": [
          "error",
          { patterns: [TERMINAL_IMPORTS, PARENT_RELATIVE_IMPORTS] },
        ],
      },
    },
  ],
})
