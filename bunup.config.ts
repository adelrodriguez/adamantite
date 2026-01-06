import { defineConfig } from "bunup"

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  sourcemap: false,
  target: "node",
})
