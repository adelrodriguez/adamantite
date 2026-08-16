import { defineConfig } from "oxlint"

export default defineConfig({
  plugins: ["node"],
  rules: {
    "node/handle-callback-err": "error",
    "node/no-exports-assign": "error",
    "node/no-mixed-requires": "error",
    "node/no-new-require": "error",
    "node/no-path-concat": "error",
  },
})
