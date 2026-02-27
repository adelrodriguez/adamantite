import { defineConfig } from "oxlint"

export default defineConfig({
  plugins: ["node"],
  rules: {
    "node/no-exports-assign": "error",
    "node/no-new-require": "error",
    "node/no-path-concat": "error",
  },
})
