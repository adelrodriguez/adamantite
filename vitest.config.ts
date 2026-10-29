import process from "node:process"
import { Macros } from "unplugin-macros"
import { defineConfig } from "vitest/config"

// These tests start real processes: Oxlint runs that lint files, and Vitest runs that check the
// module cache. They touch the host filesystem, so they stay out of the unit tests.
const PROCESS_RUN_TESTS = [
  "src/__tests__/presets/**/*.test.ts",
  "src/__tests__/macro-cache.test.ts",
]

const MACRO_IMPORT = /with\s*\{\s*type:\s*["']macro["']\s*\}/

export default defineConfig({
  plugins: [
    Macros.vite(),
    {
      // TEMPORARY: Vitest's module cache keys a module by its own source, but a macro inlines the
      // files that it reads, such as a `.template` file. unplugin-macros does not add those files
      // to the cache key, so an edit to only a template keeps the old output. Keep modules that
      // import a macro out of the cache until unplugin-macros sets the key itself.
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
          include: PROCESS_RUN_TESTS,
          name: "presets",
        },
      },
    ],
    reporters: process.env.CI ? ["default", ["html", { singleFile: true }]] : undefined,
  },
})
