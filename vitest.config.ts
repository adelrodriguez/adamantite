import process from "node:process"
import { Macros } from "unplugin-macros"
import { defineConfig } from "vitest/config"

const PRESET_TESTS = "src/__tests__/presets/**/*.test.ts"

export default defineConfig({
  plugins: [Macros.vite()],
  test: {
    coverage: {
      provider: "v8",
    },
    isolate: false,
    // Preset tests lint fixtures in real Oxlint runs, so CI runs them apart from the package's
    // unit tests. `pnpm run test` runs both projects.
    projects: [
      {
        extends: true,
        test: {
          exclude: [PRESET_TESTS],
          include: ["src/**/*.test.ts"],
          name: "unit",
        },
      },
      {
        extends: true,
        test: {
          include: [PRESET_TESTS],
          name: "presets",
        },
      },
    ],
    reporters: process.env.CI ? ["default", ["html", { singleFile: true }]] : undefined,
  },
})
