import { defineConfig } from "tsdown"
import { Macros } from "unplugin-macros"
import packageJson from "./package.json" with { type: "json" }

export default defineConfig([
  {
    deps: {
      onlyBundle: ["effect", "@effect/platform-node", "@effect/platform-node-shared"],
      onlyImport: Object.keys(packageJson.dependencies),
    },
    dts: false,
    entry: {
      index: "src/index.ts",
      oxlint: "src/oxlint/index.ts",
      probe: "src/oxlint/probe.ts",
    },
    fixedExtension: false,
    minify: true,
    plugins: [Macros.rolldown()],
  },
  {
    copy: [
      { from: ["presets/tsconfig.json", "presets/typescript.json"], to: "dist/presets" },
      { from: "presets/typescript/resets/*", to: "dist/presets/typescript/resets" },
      { flatten: false, from: "presets/lint/plugins/**/license.md", to: "dist/presets" },
    ],
    // `oxc-resolver` loads native bindings at runtime, which a bundle cannot hold.
    deps: {
      neverBundle: ["knip", "oxc-resolver", "oxfmt", "oxlint"],
      onlyBundle: ["@oxlint/plugins"],
    },
    dts: { generator: "oxc" },
    entry: ["presets/**/*.ts", "!presets/**/*.d.ts", "!presets/**/__tests__/**"],
    fixedExtension: false,
    outDir: "dist/presets",
  },
])
