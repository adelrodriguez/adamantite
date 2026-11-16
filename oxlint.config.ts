import { defineConfig } from "oxlint"
import architecture from "./presets/lint/architecture.ts"
import core, { ignorePatterns } from "./presets/lint/core.ts"
import effect from "./presets/lint/effect.ts"
import strict from "./presets/lint/strict.ts"
import vitest, { testFiles } from "./presets/lint/vitest.ts"

// Tests may import what a module owns, so they can set up and check it.
const tests = "**/__tests__/**"

export default defineConfig({
  // The vitest preset runs on this repository's tests, so `pnpm run check` fails when a preset
  // rule makes some test code impossible to write.
  extends: [architecture, core, effect, strict, vitest],
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
      { import: "effect/cli/Prompt", owners: ["src/commands", "src/terminal", tests] },
      {
        import: "oxc-resolver",
        owners: [
          "src/lib/project/module-resolver.ts",
          "presets/lint/plugins/adamantite/shared/resolver.ts",
        ],
      },
      // Commands reach the integrations through `lib/setup`, the assessment, and Toolchain. The
      // terminal renders integration types, `init` offers the preset catalog, and the Oxlint entry
      // and the build check load the Oxlint runtime.
      {
        import: "#lib/integrations",
        owners: ["src/lib", "src/terminal", "src/commands/init", "src/oxlint.ts", "scripts", tests],
      },
      // An assessment reads the workspace and the custom rules one time, in `readProject`, and every
      // integration takes them from the `Project`. Harden discovers the custom rules of its own
      // scope.
      {
        import: "#lib/project/custom-rules/discover.ts",
        names: ["discoverCustomRules"],
        owners: ["src/lib/project/project.ts", "src/lib/hardening/index.ts"],
      },
      // Only `init` and `update` write the lockfile and the managed files, through `lib/setup` and
      // the backend that they share. The terminal prints what Setup wrote.
      { import: "#lib/setup", owners: ["src/commands/setup.ts", "src/terminal/setup.ts", tests] },
      // Only Setup writes target-project files and the lockfile. Each other owner writes outside the
      // managed files: `rule add` writes the stub of a new custom rule, the VS Code integration's
      // `prepare`, which Setup runs, writes the Effect SDK copy in `node_modules`, a trial writes
      // cases and configs in a temporary copy of the project, and the Oxlint probe writes its config
      // to a temporary folder.
      {
        import: "#lib/shared/filesystem.ts",
        names: ["ensureDirectory", "writeFile"],
        owners: [
          "src/lib/setup",
          "src/lib/project/custom-rules/index.ts",
          "src/lib/integrations/effect-sdk.ts",
          "src/lib/hardening/trial.ts",
          "src/lib/hardening/oxlint.ts",
          "src/lib/integrations/oxlint/probe.ts",
          tests,
        ],
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
          tests,
        ],
      },
      // `Cwd` reads the working directory in one place, so a test provides the folder instead of
      // changing the process. `eslint/no-restricted-properties` rejects `process.cwd` elsewhere.
      { import: "node:process", names: ["chdir", "cwd"], owners: ["src/lib/shared/cwd.ts"] },
      // The package builds the presets apart from the CLI, so no file below `presets/` imports
      // `src/`, tests included. A path module also covers each import that resolves into it, such
      // as `#lib/...`.
      { import: "./src", owners: ["src", "scripts"] },
    ],
    // Each scope states its dependency graph. Child maps keep their own settings and checks.
    // See "Layers" in docs/architecture.md.
    "adamantite/layers": [
      "error",
      // Terminal interaction belongs to `commands` and the entries. Lib code returns data for
      // commands to render. Tests share the helpers in `src/__tests__`, so this map skips them.
      {
        entries: ["cli.ts", "index.ts", "oxlint.ts", "probe.ts"],
        ignore: ["**/__tests__/**"],
        layers: {
          lib: {
            imports: [],
            layers: {
              assessment: { imports: ["integrations"] },
              handoff: { imports: ["shared"] },
              // These layers independently compose integrations.
              hardening: { imports: ["integrations"] },
              integrations: { imports: ["handoff", "project"] },
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
    // Commands read the working directory with `yield* Cwd`, and tests provide it. `Cwd` takes it
    // from its named `cwd` import, which `adamantite/import-owners` allows only there.
    "eslint/no-restricted-properties": [
      "error",
      {
        message: "Read the working directory with `yield* Cwd` from `#lib/shared/cwd.ts`.",
        object: "process",
        property: "cwd",
      },
      {
        message:
          "Provide `Cwd` from `#lib/shared/cwd.ts` instead of changing the working directory.",
        object: "process",
        property: "chdir",
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
