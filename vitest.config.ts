import { Macros } from "unplugin-macros"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [Macros.vite()],
  test: {
    coverage: {
      provider: "v8",
    },
    include: ["src/**/*.test.ts"],
  },
})
