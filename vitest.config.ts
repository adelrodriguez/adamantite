import { Macros } from "unplugin-macros"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [Macros.vite()],
  test: {
    coverage: {
      provider: "v8",
    },
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
  },
})
