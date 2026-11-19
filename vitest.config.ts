import { join } from "node:path"
import process from "node:process"
import { Macros } from "unplugin-macros"
import { configDefaults, defineConfig } from "vitest/config"
import { PROCESS_RUN_TESTS } from "./config/tests.ts"

const TEST_OXLINT = process.env["ADAMANTITE_TEST_OXLINT"]

// Vitest cannot run some fixtures, such as a Jest test that imports `@jest/globals`.
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
    isolate: false,
    projects: [
      {
        extends: true,
        test: {
          benchmark: { include: [] },
          exclude: [...configDefaults.exclude, ...PROCESS_RUN_TESTS, FIXTURES],
          include: [
            ".adamantite/lint/__tests__/*.test.ts",
            "presets/**/*.test.ts",
            "scripts/__tests__/*.test.ts",
            "src/**/*.test.ts",
          ],
          name: "unit",
        },
      },
      {
        extends: true,
        test: {
          // Vitest keeps the duration of each run only with `retainSamples`, and
          // `scripts/bench-reporter.ts` reads them.
          benchmark: { include: ["src/**/*.bench.ts"], retainSamples: true },
          globalSetup: ["presets/__tests__/fixture-packages.ts"],
          // A real Oxlint or Vitest run takes up to 3.4 seconds alone and more than 5 seconds
          // while the other test files run, so the default timeouts of Vitest fail these tests at
          // random. Fixture tests lint in a `beforeAll` hook, so hooks get the same limit as tests.
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
