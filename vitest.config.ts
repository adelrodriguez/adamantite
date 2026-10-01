import process from "node:process"
import { Macros } from "unplugin-macros"
import { defineConfig } from "vitest/config"

// These tests lint files in real Oxlint runs.
const OXLINT_RUN_TESTS = ["src/__tests__/presets/**/*.test.ts", "src/__tests__/lint/**/*.test.ts"]

export default defineConfig({
  plugins: [Macros.vite()],
  test: {
    coverage: {
      provider: "v8",
    },
    isolate: false,
    // Oxlint-run tests are slower, so CI runs them apart from the package's
    // unit tests. `pnpm run test` runs both projects.
    projects: [
      {
        extends: true,
        test: {
          exclude: OXLINT_RUN_TESTS,
          include: ["src/**/*.test.ts"],
          name: "unit",
        },
      },
      {
        extends: true,
        test: {
          include: OXLINT_RUN_TESTS,
          name: "presets",
        },
      },
    ],
    reporters: process.env.CI ? ["default", ["html", { singleFile: true }]] : undefined,
  },
})
