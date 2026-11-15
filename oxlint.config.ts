import { defineConfig } from "oxlint"
import core, { ignorePatterns } from "./presets/lint/core.ts"
import effect from "./presets/lint/effect.ts"
import strict from "./presets/lint/strict.ts"
import vitest, { testFiles } from "./presets/lint/vitest.ts"

export default defineConfig({
  // The vitest preset runs on this repository's tests, so `pnpm run check` fails when a preset
  // rule makes some test code impossible to write.
  extends: [core, effect, strict, vitest],
  ignorePatterns: [
    ...ignorePatterns,
    // Rule fixtures break rules on purpose; see presets/__tests__/rule-fixtures.ts.
    "src/__tests__/presets/fixtures/",
  ],
  options: {
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    // `RuleTester` from `oxlint/plugins-dev` and `describeModelFixtures` declare their own
    // `describe` and `it` blocks, so their calls are tests, not setup code.
    {
      files: testFiles,
      plugins: vitest.plugins,
      rules: {
        "vitest/require-hook": [
          "error",
          { allowedFunctionCalls: ["describeModelFixtures", "tester.run"] },
        ],
      },
    },
    // A type reset merges a declaration into a built-in global, such as `interface Array<T>`. Only
    // a script file can declare globals without `declare global`, so the resets reference each
    // other by path instead of an import, and keep interfaces with call signatures. They also
    // restate library parameters, such as `{}` and `Function`. A narrower parameter would send some
    // calls to the library overload that returns `any`.
    {
      files: ["presets/typescript/resets/*.d.ts"],
      rules: {
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
  ],
  rules: {
    // A wrapper owns each of these packages, so the rest of the code uses the wrapper.
    "adamantite/import-owners": [
      "error",
      // Only commands and the terminal ask the user. Lib code returns data, and the command decides
      // whether to ask.
      {
        import: "effect/cli/Prompt",
        owners: ["src/commands", "src/terminal", "src/__tests__"],
      },
      {
        import: "oxc-resolver",
        owners: [
          "src/lib/project/module-resolver.ts",
          "presets/lint/plugins/adamantite/shared/resolver.ts",
        ],
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
      // Commands reach an integration that owns a folder through `lib/setup` and the assessment.
      // Each integration that moves to its own folder adds an entry.
      {
        import: "#lib/integrations/knip",
        owners: ["src/lib", "src/commands/__tests__"],
      },
      {
        import: "#lib/integrations/oxfmt",
        owners: ["src/lib", "src/commands/__tests__"],
      },
      {
        import: "#lib/integrations/vscode",
        owners: ["src/lib"],
      },
      // An assessment reads the workspace and the custom rules one time, in `readProject`, and every
      // integration takes them from the `Project`. Harden discovers the custom rules of its own
      // scope.
      {
        import: "#lib/project/custom-rules/discover.ts",
        names: ["discoverCustomRules"],
        owners: ["src/lib/project/project.ts", "src/lib/hardening/index.ts"],
      },
      // Only `init` and `update` write the lockfile and the managed files, through `lib/setup`. The
      // terminal prints what it wrote.
      {
        import: "#lib/setup",
        owners: [
          "src/commands/init",
          "src/commands/update.ts",
          "src/commands/__tests__",
          "src/terminal/setup.ts",
        ],
      },
      {
        import: "#lib/project/lockfile.ts",
        names: ["writeLockfile"],
        owners: ["src/lib/setup"],
      },
      // A command that reads the workspace outside an assessment reads it one time for each phase,
      // and passes the `Workspace` down. Harden reads again after the session, because the agent
      // can change the project.
      {
        import: "#lib/project/monorepo.ts",
        names: ["readWorkspace"],
        owners: [
          "src/lib/project/project.ts",
          "src/commands/harden.ts",
          "src/commands/rule.ts",
          "src/lib/project/__tests__/monorepo.test.ts",
        ],
      },
      // The package builds the presets apart from the CLI, so no file below `presets/` imports
      // `src/`, tests included. A path module also covers each import that resolves into it, such
      // as `#lib/...`.
      {
        import: "./src",
        owners: ["src", "scripts"],
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
              integrations: { imports: ["execution", "project"] },
              project: { imports: ["shared"] },
              setup: { imports: ["integrations"] },
              shared: { imports: [] },
              toolchain: { imports: ["integrations"] },
            },
          },

          terminal: { imports: ["lib"] },

          commands: { imports: ["terminal"] },
        },
        root: "src",
      },
      // Each plugin uses the helpers of all plugins in `shared`, and no plugin imports another
      // plugin's code. `shared` imports no plugin. `entry.ts` gives the presets the `jsPlugins` entry
      // of each plugin. In a plugin, `index.ts` registers the rules, and the rules use the helpers
      // of the plugin. The tests in each `__tests__` folder are entries: they load a plugin through
      // its entry, and no rule imports a test.
      {
        entries: ["entry.ts", "__tests__/**"],
        layers: {
          adamantite: {
            entries: ["index.ts", "__tests__/**"],
            imports: ["shared"],
            layers: {
              rules: { imports: ["shared"] },
              shared: { imports: [] },
            },
          },
          antislop: {
            entries: ["index.ts", "__tests__/**"],
            imports: ["shared"],
            layers: {
              rules: { imports: ["shared", "stylistic"] },
              shared: { imports: [] },
              stylistic: { imports: [] },
            },
          },
          "antislop-effect": {
            entries: ["index.ts", "__tests__/**"],
            imports: ["shared"],
            layers: {
              rules: { imports: ["shared"] },
              shared: { imports: [] },
            },
          },
          shared: { imports: [] },
        },
        root: "presets/lint/plugins",
      },
    ],
    // A `?raw` import gives the source text of a module, not the module, so a test can import both.
    "import/no-duplicates": ["error", { considerQueryString: true }],
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
