import { defineConfig } from "oxlint"
import core from "./presets/lint/core.ts"
import node from "./presets/lint/node.ts"

export default defineConfig({
  extends: [core, node],
})
