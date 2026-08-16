import type { TestProject } from "vitest/node"
import { build } from "tsdown"

async function buildPackage() {
  await build()
}

export async function setup(project: TestProject) {
  await buildPackage()
  project.onTestsRerun(buildPackage)
}
