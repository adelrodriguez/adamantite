import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import type { Script, SupportedPackageManager } from "#lib/workspace/package-json.ts"
import { defineIntegration, type IntegrationAssessment } from "#lib/integrations/base.ts"
import { ensureDirectory, readFileIfExists, writeFile } from "#lib/shared/filesystem.ts"
import { getCIWorkflowEntries, hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import {
  type NodeVersionSource,
  NodeVersionResolver,
} from "#lib/workspace/node-version-resolver.ts"
import { checkIsSupportedPackageManager, getManagedScripts } from "#lib/workspace/package-json.ts"

const HARDCODED_NODE_VERSION_REGEX = /^\s*node-version:\s*"?\d/m
const CHECK_COMMAND_REGEX = /\b(?:run\s+)?check\b/

interface WorkflowOptions {
  packageManager: SupportedPackageManager
  scripts: Script[]
}

function renderNodeSetup(source: NodeVersionSource): string {
  const versionInput =
    source._tag === "File"
      ? `node-version-file: "${source.path}"`
      : `node-version: "${source.value}"`

  return `      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          ${versionInput}`
}

function getSetupSteps(source: NodeVersionSource) {
  return {
    bun: `${renderNodeSetup(source)}

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Cache dependencies
        uses: actions/cache@v6
        with:
          path: |
            ~/.bun/install/cache
            node_modules
          key: \${{ runner.os }}-bun-\${{ hashFiles('bun.lock') }}
          restore-keys: |
            \${{ runner.os }}-bun-

      - name: Install dependencies
        run: bun install --frozen-lockfile`,
    deno: `      - name: Setup Deno
        uses: denoland/setup-deno@v2

      - name: Install dependencies
        run: deno install --frozen`,
    npm: `${renderNodeSetup(source)}
          cache: "npm"

      - name: Install dependencies
        run: npm ci`,
    pnpm: `      - name: Setup pnpm
        uses: pnpm/action-setup@v4

${renderNodeSetup(source)}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile`,
    yarn: `${renderNodeSetup(source)}
          cache: "yarn"

      - name: Install dependencies
        run: yarn install --frozen-lockfile`,
  } satisfies Record<SupportedPackageManager, string>
}

function generateWorkflow(
  { packageManager, scripts }: WorkflowOptions,
  source: NodeVersionSource
): string | null {
  const matrixEntries = getCIWorkflowEntries(packageManager, scripts)

  if (matrixEntries.length === 0) {
    return null
  }

  const matrixInclude = matrixEntries
    .map((entry) => `          - name: ${entry.name}\n            command: ${entry.command}`)
    .join("\n")

  const workflow = `name: adamantite

on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: \${{ matrix.name }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    strategy:
      fail-fast: false
      matrix:
        include:
${matrixInclude}

    steps:
      - name: Checkout
        uses: actions/checkout@v7

${getSetupSteps(source)[packageManager]}

      - name: Run \${{ matrix.name }}
        run: \${{ matrix.command }}`

  return `${workflow}\n`
}

const files = [{ path: ".github/workflows/adamantite.yml", type: "ci" }] as const

const writeWorkflow = (cwd: string, options: WorkflowOptions) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const resolver = yield* NodeVersionResolver
    const workflowPath = path.join(cwd, files[0].path)

    const source = yield* resolver.resolve(cwd)
    const workflowContent = generateWorkflow(options, source)

    if (!workflowContent) {
      return
    }

    yield* writeFile(workflowPath, workflowContent)
  })

export default defineIntegration({
  assess: (cwd: string, packageJson: PackageJson) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const workflowPath = path.join(cwd, files[0].path)
      const content = yield* readFileIfExists(workflowPath)

      if (content._tag === "None") {
        return { applicable: false, warnings: [] } satisfies IntegrationAssessment
      }

      const managedScripts = getManagedScripts(packageJson)
      const hasHardcodedNodeVersion = HARDCODED_NODE_VERSION_REGEX.test(content.value)
      const isMissingCheckCommand =
        managedScripts.includes("check") && !CHECK_COMMAND_REGEX.test(content.value)

      if (!hasHardcodedNodeVersion && !isMissingCheckCommand) {
        return {
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        } satisfies IntegrationAssessment
      }

      if (!hasCICompatibleScripts(managedScripts)) {
        return {
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [
            "No CI-compatible managed scripts were found, so the GitHub Actions workflow cannot be regenerated.",
          ],
        } satisfies IntegrationAssessment
      }

      const dependencyInstaller = yield* DependencyInstaller
      const detectedPackageManager = yield* dependencyInstaller.detectPackageManager(cwd)

      if (!detectedPackageManager) {
        return {
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [
            "Could not detect a package manager, so the GitHub Actions workflow cannot be regenerated.",
          ],
        } satisfies IntegrationAssessment
      }

      if (!checkIsSupportedPackageManager(detectedPackageManager.name)) {
        return {
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [
            `\`${detectedPackageManager.name}\` is not a supported package manager for CI workflow generation, so the GitHub Actions workflow cannot be regenerated.`,
          ],
        } satisfies IntegrationAssessment
      }

      return {
        applicable: true,
        findings: [
          {
            currentState: [
              ...(hasHardcodedNodeVersion
                ? ["The workflow contains a hard-coded Node.js version."]
                : []),
              ...(isMissingCheckCommand
                ? ["The workflow does not run the managed `check` script."]
                : []),
            ].join(" "),
            goal: [
              "Make the workflow run the managed `check` script.",
              "Use the project's Node.js version declaration instead of a hard-coded version.",
            ],
            id: "outdated-adamantite-workflow",
            integration: "github",
            notes: [
              `The detected package manager is \`${detectedPackageManager.name}\`. Preserve unrelated workflow jobs and project-specific settings.`,
            ],
            title: "Outdated Adamantite workflow",
          },
        ],
        packageActions: [],
        warnings: [],
      } satisfies IntegrationAssessment
    }),
  create: (cwd: string, options: WorkflowOptions) =>
    Effect.gen(function* () {
      const path = yield* Path.Path

      yield* ensureDirectory(path.dirname(path.join(cwd, files[0].path)))
      yield* writeWorkflow(cwd, options)
    }),
  detect: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      return yield* fs.exists(path.join(cwd, files[0].path))
    }),
  files,
  kind: "ci",
  name: "github",
  update: writeWorkflow,
})
