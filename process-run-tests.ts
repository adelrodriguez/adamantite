// The test files with tests that start real processes: Oxlint and Oxfmt runs that lint and format
// files, rule trials in a copy of a project, Node.js runs that load configs, and Vitest runs that
// check the module cache. They touch the host filesystem, so they stay out of the unit tests. The
// unit tests in the same file run with them. `vitest.config.ts` makes the `presets` project from
// this list, and `oxlint.config.ts` lets only these files reach the host filesystem.
export const PROCESS_RUN_TESTS = [
  "presets/__tests__/**/*.test.ts",
  "src/__tests__/macro-cache.test.ts",
  "src/oxlint/__tests__/index.test.ts",
  "src/commands/__tests__/rule.test.ts",
  "src/lib/hardening/__tests__/overrides.test.ts",
  "src/lib/hardening/__tests__/suppressions.test.ts",
  "src/lib/hardening/__tests__/trial.test.ts",
  "src/lib/integrations/oxlint/__tests__/index.test.ts",
  "src/lib/project/__tests__/config-loader.test.ts",
  "src/lib/project/custom-rules/__tests__/stub.test.ts",
  "src/lib/setup/__tests__/index.test.ts",
  "src/lib/bridge/__tests__/index.test.ts",
]
