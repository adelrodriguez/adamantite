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
    entry: ["src/index.ts", "src/oxlint.ts"],
    fixedExtension: false,
    minify: true,
    plugins: [Macros.rolldown()],
  },
  {
    copy: [
      { from: ["presets/tsconfig.json", "presets/typescript.json"], to: "dist/presets" },
      { from: "presets/typescript/resets/*", to: "dist/presets/typescript/resets" },
      // Some plugin rules started as copies of MIT-licensed code, so each license notice ships at
      // its own path. `scripts/test-build.ts` checks that every notice under presets ships.
      { flatten: false, from: "presets/lint/plugin/**/license.md", to: "dist/presets" },
    ],
    // The first-party plugin imports only types from @oxlint/plugins. Keeping the package external
    // leaves a type reference in its declarations instead of inlining Oxlint's AST types. The
    // layers rule loads oxc-resolver's native bindings at runtime, so it stays external too.
    deps: { neverBundle: ["@oxlint/plugins", "knip", "oxc-resolver", "oxfmt", "oxlint"] },
    dts: { generator: "oxc" },
    // The type resets are declaration files that the build copies.
    entry: ["presets/**/*.ts", "!presets/**/*.d.ts"],
    fixedExtension: false,
    outDir: "dist/presets",
  },
])
