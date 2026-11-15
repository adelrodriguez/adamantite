import { join } from "node:path"
import process from "node:process"
import { Macros } from "unplugin-macros"
import { defineConfig } from "vitest/config"

// An Oxlint package folder, such as `<folder>/node_modules/oxlint`, that replaces the Oxlint of the
// repository. CI sets it to test the rules with the minimum Oxlint version that `peerDependencies`
// allows. The RuleTester tests import `oxlint/plugins-dev` from it, and
// `presets/__tests__/rule-fixtures.ts` lints the preset fixtures with it.
const TEST_OXLINT = process.env["ADAMANTITE_TEST_OXLINT"]

// These tests start real processes: Oxlint and Oxfmt runs that lint and format files, rule trials
// in a copy of a project, and Vitest runs that check the module cache. They touch the host
// filesystem, so they stay out of the unit tests.
const PROCESS_RUN_TESTS = [
  "presets/__tests__/**/*.test.ts",
  "src/__tests__/macro-cache.test.ts",
  "src/commands/__tests__/formatted.test.ts",
  "src/__tests__/trial.test.ts",
  "src/lib/integrations/tooling/oxfmt/__tests__/format-preset.test.ts",
  "src/lib/integrations/tooling/oxlint/__tests__/config-load.test.ts",
  "src/lib/toolchain/__tests__/idioms.test.ts",
  "src/lib/project/custom-rules/__tests__/stub.test.ts",
]

// Fixtures are code that the preset tests lint, not tests of this repository. Vitest cannot run some
// of them, such as a Jest test that imports `@jest/globals`.
const FIXTURES = "src/__tests__/presets/fixtures/**"

const MACRO_IMPORT = /with\s*\{\s*type:\s*["']macro["']\s*\}/

export default defineConfig({
  plugins: [
    Macros.vite(),
    {
      // TEMPORARY: Vitest's module cache keys a module by its own source, but a macro inlines the
      // files that it reads, such as a `.template` file. unplugin-macros does not add those files
      // to the cache key, so an edit to only a template keeps the old output. Keep modules that
      // import a macro out of the cache until unplugin-macros sets the key itself:
      // https://github.com/unplugin/unplugin-macros/issues/179
      configureVitest({ defineCacheKeyGenerator }) {
        defineCacheKeyGenerator(({ sourceCode }) =>
          MACRO_IMPORT.test(sourceCode) ? false : undefined
        )
      },
      name: "adamantite:macro-module-cache",
    },
  ],
  resolve: {
    alias:
      TEST_OXLINT === undefined || TEST_OXLINT === ""
        ? {}
        : { "oxlint/plugins-dev": join(TEST_OXLINT, "dist/plugins-dev.js") },
  },
  test: {
    coverage: {
      provider: "v8",
    },
    isolate: false,
    // Tests that start real processes are slower, so CI runs them apart from the package's
    // unit tests. `pnpm run test` runs both projects.
    projects: [
      {
        extends: true,
        test: {
          exclude: [...PROCESS_RUN_TESTS, FIXTURES],
          include: ["presets/**/*.test.ts", "src/**/*.test.ts"],
          name: "unit",
        },
      },
      {
        extends: true,
        test: {
          // The fixture projects link the fixture packages, which have their own lockfile.
          globalSetup: ["presets/__tests__/fixture-packages.ts"],
          // A real Oxlint or Vitest run takes up to 3.4 seconds alone and more than 5 seconds
          // while the other test files run, so the default timeouts fail these tests at random.
          // Fixture tests lint in a `beforeAll` hook, so hooks get the same limit as tests. The
          // longer timeouts still stop a process that hangs.
          hookTimeout: 30_000,
          include: PROCESS_RUN_TESTS,
          name: "presets",
          testTimeout: 30_000,
        },
      },
    ],
    reporters: process.env.CI ? ["default", ["html", { singleFile: true }]] : undefined,
  },
})
