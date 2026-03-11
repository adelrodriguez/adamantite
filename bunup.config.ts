import { defineConfig } from "bunup"

export default defineConfig([
  {
    clean: true,
    dts: false,
    entry: ["src/index.ts"],
    minify: true,
    name: "cli",
    outDir: "dist",
    sourcemap: false,
    target: "node",
  },
  {
    clean: false,
    dts: {
      inferTypes: true,
      tsgo: true,
    },
    entry: [
      "presets/lint/core.ts",
      "presets/lint/jest.ts",
      "presets/lint/nextjs.ts",
      "presets/lint/node.ts",
      "presets/lint/react.ts",
      "presets/lint/vitest.ts",
      "presets/lint/vue.ts",
    ],
    external: ["oxlint"],
    name: "lint-presets",
    outDir: "dist/presets/lint",
    sourcemap: false,
    splitting: false,
    target: "node",
  },
])
