import { defineConfig } from "oxlint"
import antislop from "./presets/lint/antislop.ts"
import core, { ignorePatterns } from "./presets/lint/core.ts"
import effect from "./presets/lint/effect.ts"
import node from "./presets/lint/node.ts"
import strict from "./presets/lint/strict.ts"
import vitest, { testFiles } from "./presets/lint/vitest.ts"

export default defineConfig({
  extends: [core, node, antislop, effect, strict],
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
      files: testFiles,
      plugins: vitest.plugins,
      rules: {
        ...vitest.rules,
        // Describe titles name the service or error class under test, such as `NodeVersionResolver`.
        "vitest/prefer-lowercase-title": ["error", { ignore: ["describe"] }],
        // `RuleTester` from `oxlint/plugins-dev` and `describeModelFixtures` declare their own
        // `describe` and `it` blocks, so their calls are tests, not setup code.
        "vitest/require-hook": [
          "error",
          { allowedFunctionCalls: ["describeModelFixtures", "tester.run"] },
        ],
      },
    },
    // A wildcard module declaration is valid only in a script file. The override is temporary:
    // inline disable comments do not suppress file-scope rules (oxc-project/oxc#21072).
    {
      files: ["src/__tests__/raw.d.ts"],
      rules: {
        "import/unambiguous": "off",
      },
    },
  ],
  rules: {
    // A wrapper owns each of these packages, so the rest of the code uses the wrapper.
    "adamantite/import-owners": [
      "error",
      {
        import: "@clack/prompts",
        owners: [
          "src/terminal/prompter.ts",
          "src/terminal/__tests__/prompter.test.ts",
          "src/commands/__tests__/command-test-helpers.ts",
        ],
      },
      {
        import: "oxc-resolver",
        owners: ["src/lib/workspace/module-resolver.ts", "presets/lint/plugin/rules/layers.ts"],
      },
    ],
    // Two layer maps, from the bottom up. Each layer imports only the layers it lists and the layers
    // below those. See "Layers" in docs/architecture.md.
    "adamantite/layers": [
      "error",
      // Terminal interaction belongs to `commands` and the entries. Lib code returns data for
      // commands to render. Tests share the helpers in `src/__tests__`, so this map skips them.
      {
        entries: ["cli.ts", "index.ts"],
        ignore: ["**/__tests__/**"],
        layers: {
          lib: [],

          terminal: ["lib"],

          commands: ["terminal"],
        },
        root: "src",
      },
      {
        layers: {
          shared: [],

          execution: ["shared"],
          workspace: ["shared"],

          // Harden is not an assessment, so `assessment` does not import `hardening`.
          hardening: ["workspace", "execution"],
          integrations: ["workspace", "execution"],

          assessment: ["integrations"],
        },
        root: "src/lib",
      },
    ],
  },
})
