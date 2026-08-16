import { defineConfig } from "tsdown"
import { Macros } from "unplugin-macros"
import packageJson from "./package.json" with { type: "json" }

export default defineConfig([
  {
    deps: {
      neverBundle: true,
      onlyImport: Object.keys(packageJson.dependencies),
    },
    dts: false,
    entry: ["src/index.ts"],
    fixedExtension: false,
    minify: true,
    plugins: [Macros.rolldown()],
  },
  {
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
    dts: { oxc: true },
    entry: ["presets/**/*.ts"],
    fixedExtension: false,
    outDir: "dist/presets",
  },
])
