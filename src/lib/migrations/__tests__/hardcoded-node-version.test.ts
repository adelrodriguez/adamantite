import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { createDependencyInstallerTestContext } from "#commands/__tests__/command-test-helpers.ts"
import migrationHardcodedNodeVersion from "#lib/migrations/hardcoded-node-version.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"

const HARDCODED_WORKFLOW = `name: adamantite

jobs:
  verify:
    steps:
      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version: "26"
`

function runTestEffect<A, E>(
  effect: Effect.Effect<
    A,
    E,
    DependencyInstaller | NodeServices.NodeServices | NodeVersionResolver
  >,
  options?: Parameters<typeof createDependencyInstallerTestContext>[0]
) {
  const dependencyInstallerContext = createDependencyInstallerTestContext(options)
  const provided = effect.pipe(
    Effect.provide(
      Layer.mergeAll(
        NodeServices.layer,
        NodeVersionResolver.layer.pipe(Layer.provide(NodeServices.layer)),
        dependencyInstallerContext.layer
      )
    )
  )
  return Effect.runPromise(provided)
}

async function writeManagedProject() {
  await Bun.write(
    "package.json",
    JSON.stringify(
      {
        name: "test-project",
        scripts: {
          check: "adamantite check",
        },
        version: "1.0.0",
      },
      null,
      2
    )
  )
  mkdirSync(".github/workflows", { recursive: true })
  await Bun.write(".github/workflows/adamantite.yml", HARDCODED_WORKFLOW)
}

describe("hardcodedNodeVersion", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-hardcoded-node-version-migration-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  test("check reports not-applicable when no workflow exists", async () => {
    const result = await runTestEffect(migrationHardcodedNodeVersion.check({ cwd: tempDir }))

    expect(result).toEqual({ status: "not-applicable", warnings: [] })
  })

  test("check reports not-applicable when the workflow already uses node-version-file", async () => {
    mkdirSync(".github/workflows", { recursive: true })
    await Bun.write(
      ".github/workflows/adamantite.yml",
      'name: adamantite\n          node-version-file: ".node-version"\n'
    )

    const result = await runTestEffect(migrationHardcodedNodeVersion.check({ cwd: tempDir }))

    expect(result).toEqual({ status: "not-applicable", warnings: [] })
  })

  test("check reports not-applicable when the workflow uses lts/*", async () => {
    mkdirSync(".github/workflows", { recursive: true })
    await Bun.write(
      ".github/workflows/adamantite.yml",
      'name: adamantite\n          node-version: "lts/*"\n'
    )

    const result = await runTestEffect(migrationHardcodedNodeVersion.check({ cwd: tempDir }))

    expect(result).toEqual({ status: "not-applicable", warnings: [] })
  })

  test("check reports that a hard-coded Node.js version needs migration", async () => {
    await writeManagedProject()

    const result = await runTestEffect(migrationHardcodedNodeVersion.check({ cwd: tempDir }))

    expect(result).toMatchObject({ status: "needed" })
  })

  test("migrate points the workflow at the project's Node.js version file", async () => {
    await writeManagedProject()
    await Bun.write(".node-version", "22.19.0\n")

    await runTestEffect(migrationHardcodedNodeVersion.migrate({ cwd: tempDir }))

    const workflow = await Bun.file(".github/workflows/adamantite.yml").text()
    expect(workflow).toContain('node-version-file: ".node-version"')
    expect(workflow).not.toContain('node-version: "26"')

    await runTestEffect(migrationHardcodedNodeVersion.validate({ cwd: tempDir }))
  })

  test("migrate falls back to lts/* when the project declares no Node.js version", async () => {
    await writeManagedProject()

    await runTestEffect(migrationHardcodedNodeVersion.migrate({ cwd: tempDir }))

    const workflow = await Bun.file(".github/workflows/adamantite.yml").text()
    expect(workflow).toContain('node-version: "lts/*"')
    expect(workflow).not.toContain('node-version: "26"')

    await runTestEffect(migrationHardcodedNodeVersion.validate({ cwd: tempDir }))
  })

  test("check reports not-applicable with a warning without CI-compatible managed scripts", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify({ name: "test-project", version: "1.0.0" }, null, 2)
    )
    mkdirSync(".github/workflows", { recursive: true })
    await Bun.write(".github/workflows/adamantite.yml", HARDCODED_WORKFLOW)

    const result = await runTestEffect(migrationHardcodedNodeVersion.check({ cwd: tempDir }))

    expect(result).toEqual({
      status: "not-applicable",
      warnings: [
        "No CI-compatible managed scripts were found, so the GitHub Actions workflow was not updated.",
      ],
    })

    const workflow = await Bun.file(".github/workflows/adamantite.yml").text()
    expect(workflow).toBe(HARDCODED_WORKFLOW)
  })

  test("check reports not-applicable with a warning for an unsupported package manager", async () => {
    await writeManagedProject()

    const result = await runTestEffect(migrationHardcodedNodeVersion.check({ cwd: tempDir }), {
      detectedPackageManager: { name: "aube" },
    })

    expect(result).toEqual({
      status: "not-applicable",
      warnings: [
        "`aube` is not a supported package manager for CI workflow generation, so the GitHub Actions workflow was not updated.",
      ],
    })

    const workflow = await Bun.file(".github/workflows/adamantite.yml").text()
    expect(workflow).toBe(HARDCODED_WORKFLOW)
  })

  test("check reports not-applicable with a warning when no package manager is detected", async () => {
    await writeManagedProject()

    const result = await runTestEffect(migrationHardcodedNodeVersion.check({ cwd: tempDir }), {
      detectedPackageManager: null,
    })

    expect(result).toEqual({
      status: "not-applicable",
      warnings: [
        "Could not detect a package manager, so the GitHub Actions workflow was not updated.",
      ],
    })
  })
})
