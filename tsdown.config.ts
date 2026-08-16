import path from "node:path"
import { defineConfig, type TsdownPlugin } from "tsdown"
import { Macros } from "unplugin-macros"

// Presets call oxlint's defineConfig, an identity function documented to
// return the config unchanged.
// Inlining a shim keeps the compiled presets importable without oxlint
// installed. The virtual module id embeds the importer so every preset gets
// its own inlined copy instead of a shared, content-hashed chunk.
const SHIM_PREFIX = "\0oxlint-defineconfig-shim:"

const inlineOxlintDefineConfig: TsdownPlugin = {
  load(id) {
    if (!id.startsWith(SHIM_PREFIX)) {
      return null
    }

    return "export function defineConfig(config) {\n  return config\n}\n"
  },
  name: "inline-oxlint-defineconfig",
  resolveId(id, importer) {
    if (id !== "oxlint") {
      return null
    }

    const stableImporter = importer ? path.relative(import.meta.dirname, importer) : ""
    return `${SHIM_PREFIX}${stableImporter}`
  },
}

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
    deps: { neverBundle: ["oxfmt", "knip"] },
    dts: true,
    entry: ["presets/**/*.ts"],
    outDir: "dist/presets",
    outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
    platform: "node",
    plugins: [inlineOxlintDefineConfig],
  },
])
