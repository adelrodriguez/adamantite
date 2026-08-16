import { defineConfig } from "tsdown"
import { Macros } from "unplugin-macros"

export default defineConfig([
  {
    clean: true,
    dts: false,
    entry: ["src/index.ts"],
    minify: true,
    outDir: "dist",
    outExtensions: () => ({ js: ".js" }),
    platform: "node",
    plugins: [Macros.rolldown()],
  },
  {
    clean: false,
    copy: [
      { from: "presets/tsconfig.json", to: "dist/presets/tsconfig.json" },
      { from: "presets/lint/antislop/plugin.mjs", to: "dist/presets/lint/antislop/plugin.mjs" },
      { from: "presets/lint/antislop/license.md", to: "dist/presets/lint/antislop/license.md" },
    ],
    deps: { neverBundle: ["knip", "oxfmt", "oxlint"] },
    dts: true,
    entry: ["presets/**/*.ts"],
    outDir: "dist/presets",
    outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
    platform: "node",
  },
])
