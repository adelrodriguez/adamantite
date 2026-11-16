import { defineConfig } from "oxlint"
// Knip reads each file that the config imports by a relative path for the package names that it
// spells. `presets/rules/folder.ts` spells `.cache`, so through `./presets/rules/custom.ts` Knip
// reports the entry module that `custom()` writes to `node_modules/.cache` as the unlisted package
// `.cache`.
import custom from "#presets/rules/custom.ts"
import architecture from "./presets/lint/architecture.ts"
import core, { ignorePatterns } from "./presets/lint/core.ts"
import effect from "./presets/lint/effect.ts"
import strict from "./presets/lint/strict.ts"
import vitest, { testFiles } from "./presets/lint/vitest.ts"

export default defineConfig({
  // The vitest preset runs on this repository's tests, so `pnpm run check` fails when a preset
  // rule makes some test code impossible to write. `custom()` loads the rules in `.adamantite/lint`.
  extends: [architecture, core, effect, strict, vitest, custom()],
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
    "adamantite/import-owners": [
      "error",
      // Only commands and the terminal ask the user. Lib code returns data, and the command decides
      // whether to ask.
      { import: "effect/cli/Prompt", owners: ["src/commands", "src/terminal", "**/__tests__/**"] },
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
    ],
    // Commands read the working directory with `yield* Cwd`, and tests provide it.
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
