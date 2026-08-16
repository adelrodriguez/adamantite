import { defineConfig, type TsdownPlugin } from "tsdown"
import { Macros } from "unplugin-macros"

// Presets call oxlint's defineConfig, an identity function documented to
// return the config unchanged. Inlining a shim keeps the compiled presets
// importable without oxlint installed.
const inlineOxlintDefineConfig: TsdownPlugin = {
  load(id) {
    if (id !== "\0oxlint-defineconfig-shim") {
      return null
    }

    return "export function defineConfig(config) {\n  return config\n}\n"
  },
  name: "inline-oxlint-defineconfig",
  resolveId(id) {
    return id === "oxlint" ? "\0oxlint-defineconfig-shim" : null
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
    dts: true,
    entry: ["presets/**/*.ts"],
    external: ["oxfmt", "knip"],
    outDir: "dist/presets",
    outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
    platform: "node",
    plugins: [inlineOxlintDefineConfig],
  },
])
