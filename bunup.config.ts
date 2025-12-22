import { defineConfig } from "bunup"

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  target: "node",
  sourcemap: false,
})
