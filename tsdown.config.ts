import { defineConfig } from "tsdown"
import { Macros } from "unplugin-macros"

export default defineConfig([
  {
    clean: true,
    deps: {
      neverBundle: true,
      onlyImport: [
        "@clack/prompts",
        "@effect/platform-node",
        "defu",
        "effect",
        "esrap",
        "jsonc-parser",
        "nypm",
        "oxc-parser",
      ],
    },
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
      { from: "presets/tsconfig.json", to: "dist/presets" },
      {
        from: [
          "presets/lint/antislop/plugin.mjs",
          "presets/lint/antislop/plugin.d.mts",
          "presets/lint/antislop/license.md",
        ],
        to: "dist/presets/lint/antislop",
      },
    ],
    deps: { neverBundle: ["knip", "oxfmt", "oxlint"] },
    dts: true,
    entry: ["presets/**/*.ts"],
    outDir: "dist/presets",
    outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
    platform: "node",
  },
])
