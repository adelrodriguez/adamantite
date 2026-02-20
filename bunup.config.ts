import { defineConfig } from "bunup"

export default defineConfig({
  entry: ["src/index.ts"],
  minify: true,
  outDir: "dist",
  sourcemap: false,
  target: "node",
})
