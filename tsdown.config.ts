import { defineConfig } from "tsdown"

export default defineConfig({
  dts: true,
  entry: ["cli/index.ts"],
  minify: true,
  outDir: "dist",
  platform: "neutral",
  sourcemap: false,
  nodeProtocol: "strip",
})
