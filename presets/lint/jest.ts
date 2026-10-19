import type { OxlintConfig } from "oxlint"

/**
 * The files that Jest runs as tests by default. The preset applies its rules only to these files.
 * To change the files or a rule, use the preset in an override of your own instead of `extends`:
 *
 * ```ts
 * import jest, { testFiles } from "adamantite/lint/jest"
 *
 * export default defineConfig({
 *   overrides: [{ files: testFiles, plugins: jest.plugins, rules: { ...jest.rules } }],
 * })
 * ```
 */
export const testFiles: string[] = [
  "**/*.{test,spec}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
  "**/__tests__/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
]

const plugins: OxlintConfig["plugins"] = ["jest"]

const rules: OxlintConfig["rules"] = {
  "jest/consistent-test-it": "error",
  "jest/expect-expect": "error",
  "jest/max-expects": "error",
  "jest/max-nested-describe": "error",
  "jest/no-alias-methods": "error",
  "jest/no-commented-out-tests": "error",
  "jest/no-conditional-expect": "error",
  "jest/no-conditional-in-test": "error",
  "jest/no-confusing-set-timeout": "error",
  "jest/no-deprecated-functions": "error",
  "jest/no-disabled-tests": "error",
  "jest/no-done-callback": "error",
  "jest/no-duplicate-hooks": "error",
  "jest/no-export": "error",
  "jest/no-focused-tests": "error",
  "jest/no-hooks": "off",
  "jest/no-identical-title": "error",
  "jest/no-interpolation-in-snapshots": "error",
  "jest/no-jasmine-globals": "error",
  "jest/no-large-snapshots": "error",
  "jest/no-mocks-import": "error",
  "jest/no-restricted-jest-methods": "error",
  "jest/no-restricted-matchers": "error",
  "jest/no-standalone-expect": "error",
  "jest/no-test-prefixes": "error",
  "jest/no-test-return-statement": "error",
  "jest/no-unneeded-async-expect-function": "error",
  "jest/no-untyped-mock-factory": "error",
  "jest/padding-around-after-all-blocks": "error",
  "jest/padding-around-test-blocks": "error",
  "jest/prefer-called-with": "error",
  "jest/prefer-comparison-matcher": "error",
  "jest/prefer-each": "error",
  "jest/prefer-ending-with-an-expect": "error",
  "jest/prefer-equality-matcher": "error",
  // Without options, the rule requires the call in every test, also in synchronous tests where
  // every expect always runs. These options report only tests where an expect can fail to run.
  "jest/prefer-expect-assertions": [
    "error",
    {
      onlyFunctionsWithAsyncKeyword: true,
      onlyFunctionsWithExpectInCallback: true,
      onlyFunctionsWithExpectInLoop: true,
    },
  ],
  "jest/prefer-expect-resolves": "error",
  "jest/prefer-hooks-in-order": "error",
  "jest/prefer-hooks-on-top": "error",
  "jest/prefer-jest-mocked": "error",
  "jest/prefer-lowercase-title": "error",
  "jest/prefer-mock-promise-shorthand": "error",
  "jest/prefer-mock-return-shorthand": "error",
  "jest/prefer-snapshot-hint": "error",
  "jest/prefer-spy-on": "error",
  "jest/prefer-strict-equal": "error",
  "jest/prefer-to-be": "error",
  "jest/prefer-to-contain": "error",
  "jest/prefer-to-have-been-called": "error",
  "jest/prefer-to-have-been-called-times": "error",
  "jest/prefer-to-have-length": "error",
  "jest/prefer-todo": "error",
  "jest/require-hook": "error",
  "jest/require-to-throw-message": "error",
  "jest/require-top-level-describe": "error",
  "jest/valid-describe-callback": "error",
  "jest/valid-expect": "error",
  "jest/valid-expect-in-promise": "error",
  "jest/valid-title": "error",
}

const config: OxlintConfig = {
  overrides: [{ files: testFiles, plugins, rules }],
}

// Oxlint reads a config through `JSON.stringify`, which skips non-enumerable properties. So a config
// that extends the preset gets only the override for test files, while a project override can still
// read `jest.plugins` and `jest.rules`. See ADR 0011. `src/__tests__/presets/test-presets.test.ts`
// checks both uses.
Object.defineProperties(config, { plugins: { value: plugins }, rules: { value: rules } })

export default config
