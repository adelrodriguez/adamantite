import core from "adamantite/lint"
import node from "adamantite/lint/node"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core, node],
})
