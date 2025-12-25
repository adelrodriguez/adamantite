import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import { Fault } from "faultier"
import { fromPromise, ok, safeTry } from "neverthrow"
import { type PackageManagerName, runScriptCommand } from "nypm"
import { checkIfExists } from "#utils.ts"

interface WorkflowOptions {
  packageManager: PackageManagerName
  scripts: string[]
}

const setupSteps: Record<PackageManagerName, string> = {
  bun: `      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: |
            ~/.bun/install/cache
            node_modules
          key: \${{ runner.os }}-bun-\${{ hashFiles('bun.lock') }}
          restore-keys: |
            \${{ runner.os }}-bun-

      - name: Install dependencies
        run: bun install --frozen-lockfile`,

  pnpm: `      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: "22"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile`,

  yarn: `      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: "22"
          cache: "yarn"

      - name: Install dependencies
        run: yarn install --frozen-lockfile`,

  npm: `      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: "22"
          cache: "npm"

      - name: Install dependencies
        run: npm ci`,

  deno: `      - name: Setup Deno
        uses: denoland/setup-deno@v2

      - name: Install dependencies
        run: deno install --frozen`,
}

/**
 * Builds the command string for a given script and package manager.
 * Special handling for Bun + format --check to avoid double-dash.
 */
const buildCommand = (
  packageManager: PackageManagerName,
  script: string,
  args?: string[]
): string => runScriptCommand(packageManager, script, { args })

const generateWorkflow = ({ packageManager, scripts }: WorkflowOptions): string | null => {
  const matrixEntries: Array<{ name: string; command: string }> = []

  // Map scripts to matrix entries
  if (scripts.includes("check")) {
    matrixEntries.push({
      name: "lint",
      command: buildCommand(packageManager, "check"),
    })
  }

  if (scripts.includes("format")) {
    matrixEntries.push({
      name: "format",
      command: buildCommand(packageManager, "format", ["--check"]),
    })
  }

  if (scripts.includes("typecheck")) {
    matrixEntries.push({
      name: "types",
      command: buildCommand(packageManager, "typecheck"),
    })
  }

  if (scripts.includes("check:monorepo")) {
    matrixEntries.push({
      name: "monorepo",
      command: buildCommand(packageManager, "check:monorepo"),
    })
  }

  // Return null if no CI-compatible scripts were selected
  if (matrixEntries.length === 0) {
    return null
  }

  // Format matrix entries as YAML
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
        uses: actions/checkout@v4

${setupSteps[packageManager]}

      - name: Run \${{ matrix.name }}
        run: \${{ matrix.command }}`

  return `${workflow}\n`
}

/**
 * Check if any CI-compatible scripts are in the list.
 * CI-compatible scripts are: check, format, typecheck, check:monorepo
 */
export const hasCICompatibleScripts = (scripts: string[]): boolean =>
  scripts.some((script) => ["check", "format", "typecheck", "check:monorepo"].includes(script))

export const github = {
  workflowPath: ".github/workflows/adamantite.yml",

  exists: () => checkIfExists(join(process.cwd(), ".github", "workflows", "adamantite.yml")),

  create: (options: WorkflowOptions) =>
    safeTry(async function* () {
      const workflowDir = join(process.cwd(), ".github", "workflows")

      // Create .github/workflows directory if it doesn't exist
      yield* fromPromise(mkdir(workflowDir, { recursive: true }), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_CREATE_DIRECTORY")
          .withDescription(
            "Failed to create .github/workflows directory",
            "We're unable to create the .github/workflows directory in the current directory."
          )
          .withContext({ path: workflowDir })
      )

      const workflowContent = generateWorkflow(options)

      if (!workflowContent) {
        return ok()
      }

      yield* fromPromise(writeFile(join(workflowDir, "adamantite.yml"), workflowContent), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_WRITE_FILE")
          .withDescription(
            "Failed to write GitHub Actions workflow",
            "We're unable to write the GitHub Actions workflow file."
          )
          .withContext({ path: join(workflowDir, "adamantite.yml") })
      )

      return ok()
    }),

  update: (options: WorkflowOptions) =>
    safeTry(async function* () {
      const workflowPath = join(process.cwd(), ".github", "workflows", "adamantite.yml")
      const workflowContent = generateWorkflow(options)

      if (!workflowContent) {
        return ok()
      }

      yield* fromPromise(writeFile(workflowPath, workflowContent), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_WRITE_FILE")
          .withDescription(
            "Failed to write GitHub Actions workflow",
            "We're unable to update the GitHub Actions workflow file."
          )
          .withContext({ path: workflowPath })
      )

      return ok()
    }),
}

export type { WorkflowOptions }
