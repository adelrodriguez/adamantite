import type { TestProject } from "vitest/node"
import { build } from "tsdown"
import tsdownConfig from "../tsdown.config.ts"

// Only the CLI smoke tests read dist: they spawn `bin/adamantite`, which
// imports `dist/index.js`. Build that bundle alone and skip the preset
// compilation and declaration emit.
const [cliBundleConfig] = tsdownConfig

async function buildCliBundle() {
  await build({ ...cliBundleConfig, config: false })
}

export async function setup(project: TestProject) {
  if (process.env.ADAMANTITE_SKIP_TEST_BUILD) {
    return
  }

  await buildCliBundle()
  project.onTestsRerun(buildCliBundle)
}
