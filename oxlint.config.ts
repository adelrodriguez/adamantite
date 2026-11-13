import { defineConfig } from "oxlint"
import core, { ignorePatterns } from "./presets/lint/core.ts"
import effect from "./presets/lint/effect.ts"
import node from "./presets/lint/node.ts"
import strict from "./presets/lint/strict.ts"
import vitest, { testFiles } from "./presets/lint/vitest.ts"

export default defineConfig({
  extends: [core, node, effect, strict],
  ignorePatterns: [
    ...ignorePatterns,
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
    // A type reset merges a declaration into a built-in global, such as `interface Array<T>`. Only
    // a script file can declare globals without `declare global`, so the resets reference each
    // other by path instead of an import, redeclare built-in names, and keep interfaces with call
    // signatures. They declare built-in contracts that take or return `unknown` on purpose, and
    // restate library parameters, such as `{}`, `object`, and `Function`. A narrower parameter would
    // send some calls to the library overload that returns `any`.
    {
      files: ["presets/typescript/resets/*.d.ts"],
      rules: {
        "anti-slop/no-object-parameters": "off",
        "anti-slop/no-unknown-parameters": "off",
        "anti-slop/no-unknown-returns": "off",
        "anti-slop/no-unsafe-dictionary-type": "off",
        "eslint/no-redeclare": ["error", { builtinGlobals: false }],
        "import/unambiguous": "off",
        "typescript/no-empty-object-type": ["error", { allowObjectTypes: "always" }],
        "typescript/no-unsafe-function-type": "off",
        "typescript/prefer-function-type": "off",
        "typescript/triple-slash-reference": ["error", { path: "always" }],
      },
    },
    // The eval() reset redeclares `eval` to merge an overload into the built-in function. Core lint
    // reports eval() calls, but `adamantite/typescript` also works without the lint presets.
    {
      files: ["presets/typescript/resets/eval.d.ts"],
      rules: {
        "eslint/no-implicit-globals": "off",
        "eslint/no-shadow-restricted-names": "off",
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
        owners: ["src/lib/workspace/module-resolver.ts", "presets/lint/plugins/shared/resolver.ts"],
      },
      // Commands run tools through Toolchain. Only the lifecycle commands `init` and `update` use
      // the tooling integrations directly.
      {
        import: "#lib/integrations/tooling",
        owners: [
          "src/lib",
          "src/commands/init",
          "src/commands/update.ts",
          "src/commands/__tests__",
          "src/__tests__",
          "src/oxlint.ts",
          // The build check reads the file name of the Oxlint entry.
          "scripts/test-build.ts",
        ],
      },
      // An assessment reads the workspace and the custom rules one time, in `readProject`, and every
      // integration takes them from the `Project`. Harden discovers the custom rules of its own
      // scope.
      {
        import: "#lib/workspace/custom-rules/discover.ts",
        names: ["discoverCustomRules"],
        owners: ["src/lib/workspace/project.ts", "src/lib/hardening/index.ts"],
      },
      // A command that reads the workspace outside an assessment reads it one time for each phase,
      // and passes the `Workspace` down. Harden reads again after the session, because the agent
      // can change the project.
      {
        import: "#lib/workspace/monorepo.ts",
        names: ["readWorkspace"],
        owners: [
          "src/lib/workspace/project.ts",
          "src/commands/harden.ts",
          "src/commands/rule.ts",
          "src/lib/workspace/__tests__/monorepo.test.ts",
        ],
      },
    ],
    // Each scope states its dependency graph. Child maps keep their own settings and checks.
    // See "Layers" in docs/architecture.md.
    "adamantite/layers": [
      "error",
      // Terminal interaction belongs to `commands` and the entries. Lib code returns data for
      // commands to render. Tests share the helpers in `src/__tests__`, so this map skips them.
      {
        entries: ["cli.ts", "index.ts", "oxlint.ts"],
        ignore: ["**/__tests__/**"],
        layers: {
          lib: {
            imports: [],
            layers: {
              assessment: { imports: ["integrations"] },
              execution: { imports: ["shared"] },
              // These layers independently compose integrations.
              hardening: { imports: ["integrations"] },
              integrations: { imports: ["workspace", "execution"] },
              shared: { imports: [] },
              toolchain: { imports: ["integrations"] },
              workspace: { imports: ["shared"] },
            },
          },

          terminal: { imports: ["lib"] },

          commands: { imports: ["terminal"] },
        },
        root: "src",
      },
      // Each plugin uses the plugin-wide helpers in `shared`, and no plugin imports another
      // plugin's code. `shared` imports no plugin. `index.ts` registers the adamantite plugin.
      {
        entries: ["index.ts"],
        layers: {
          "anti-slop": { imports: ["shared"] },
          "anti-slop-effect": { imports: ["shared"] },
          rules: { imports: ["shared"] },
          shared: { imports: [] },
        },
        root: "presets/lint/plugins",
      },
    ],
    // Repository suppressions use `@ts-expect-error - reason`, so the format belongs in the check.
    "typescript/ban-ts-comment": [
      "error",
      {
        minimumDescriptionLength: 3,
        "ts-check": false,
        "ts-expect-error": { descriptionFormat: "^ - \\S" },
        "ts-ignore": true,
        "ts-nocheck": "allow-with-description",
      },
    ],
  },
})
