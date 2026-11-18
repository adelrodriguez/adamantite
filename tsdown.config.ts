import { defineConfig } from "tsdown"
import { Macros } from "unplugin-macros"
import packageJson from "./package.json" with { type: "json" }

export default defineConfig([
  {
    // The bundles of the CLI and of the Oxlint entry include Effect and `@effect/platform-node`, so
    // Node.js loads three files at startup in place of more than two hundred Effect modules, and
    // the package installs neither. Each runtime dependency stays
    // external, such as `oxc-resolver`, which loads native bindings. The build fails when the
    // bundle imports any other package, or bundles a package that `onlyBundle` leaves out.
    deps: {
      onlyBundle: ["effect", "@effect/platform-node", "@effect/platform-node-shared"],
      onlyImport: Object.keys(packageJson.dependencies),
    },
    dts: false,
    // The Oxlint entry and the probe plugin run in Oxlint's process, so they live in `src/oxlint`.
    // Each one still builds beside the CLI bundle, where `OxlintProbe` and the entry path look.
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
      // Some plugin rules started as copies of MIT-licensed code, so each license notice ships at
      // its own path. `scripts/test-build.ts` checks that every notice under presets ships.
      { flatten: false, from: "presets/lint/plugins/**/license.md", to: "dist/presets" },
    ],
    // The layers rule loads oxc-resolver's native bindings at runtime, so it stays external. The
    // presets import only types from @oxlint/plugins, a devDependency, so the declarations inline
    // them and a project type-checks its rules without installing the package.
    deps: {
      neverBundle: ["knip", "oxc-resolver", "oxfmt", "oxlint"],
      onlyBundle: ["@oxlint/plugins"],
    },
    dts: { generator: "oxc" },
    // The type resets are declaration files that the build copies. The tests stay out of the
    // package.
    entry: ["presets/**/*.ts", "!presets/**/*.d.ts", "!presets/**/__tests__/**"],
    fixedExtension: false,
    outDir: "dist/presets",
  },
])
