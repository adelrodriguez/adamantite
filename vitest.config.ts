import process from "node:process"
import { Macros } from "unplugin-macros"
import { defineConfig } from "vitest/config"

// These tests start real processes: Oxlint runs that lint files, rule trials in a copy of a
// project, and Vitest runs that check the module cache. They touch the host filesystem, so they
// stay out of the unit tests.
const PROCESS_RUN_TESTS = [
  "src/__tests__/presets/**/*.test.ts",
  "src/__tests__/macro-cache.test.ts",
  "src/__tests__/trial.test.ts",
]

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
          exclude: PROCESS_RUN_TESTS,
          include: ["src/**/*.test.ts"],
          name: "unit",
        },
      },
      {
        extends: true,
        test: {
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
