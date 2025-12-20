import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  platform: "node",
  sourcemap: false,
  nodeProtocol: "strip",
})
