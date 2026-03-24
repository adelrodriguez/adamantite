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
    dts: true,
    entry: ["presets/**/*.ts"],
    external: ["oxlint", "oxfmt"],
    name: "presets",
    outDir: "dist/presets",
    sourceBase: "presets",
    sourcemap: false,
    splitting: false,
    target: "node",
  },
])
