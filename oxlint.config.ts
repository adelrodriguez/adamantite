import { defineConfig } from "oxlint"
import antislop from "./presets/lint/antislop.ts"
import core, { ignorePatterns } from "./presets/lint/core.ts"
import node from "./presets/lint/node.ts"

export default defineConfig({
  extends: [core, node, antislop],
  ignorePatterns: [
    ...ignorePatterns,
    // Vendored plugin directories are entirely generated; see scripts/vendor-plugins.ts.
    "presets/lint/*/",
  ],
  options: {
    typeAware: true,
    typeCheck: true,
  },
})
