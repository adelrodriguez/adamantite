import { defineConfig } from "tsdown"
import { Macros } from "unplugin-macros"
import packageJson from "./package.json" with { type: "json" }

export default defineConfig([
  {
    deps: {
      neverBundle: true,
      // Deliberately tracks package.json: adding a runtime dependency widens
      // this import guard without a change to the build config.
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
          "presets/lint/vendor/antislop/plugin.mjs",
          "presets/lint/vendor/antislop/plugin.d.mts",
          "presets/lint/vendor/antislop/license.md",
        ],
        to: "dist/presets/lint/vendor/antislop",
      },
      {
        from: [
          "presets/lint/vendor/shadcn/plugin.mjs",
          "presets/lint/vendor/shadcn/plugin.d.mts",
          "presets/lint/vendor/shadcn/tailwind-worker.js",
          "presets/lint/vendor/shadcn/license.md",
        ],
        to: "dist/presets/lint/vendor/shadcn",
      },
    ],
    deps: { neverBundle: ["knip", "oxfmt", "oxlint"] },
    dts: { oxc: true },
    entry: ["presets/**/*.ts"],
    fixedExtension: false,
    outDir: "dist/presets",
  },
])
