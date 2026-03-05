import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Effect from "effect/Effect"
import { type PackageManagerName, runScriptCommand } from "nypm"
import type { Script } from "#types.ts"
import { FailedToWriteFile } from "#errors.ts"
import { ensureDirectory } from "#utils.ts"

interface WorkflowOptions {
  packageManager: PackageManagerName
  scripts: Script[]
}

interface MatrixScriptEntry {
  script: Script
  name: string
  args?: string[]
}

const setupSteps: Record<PackageManagerName, string> = {
  bun: `      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: "22"

      - name: Setup Bun
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

  deno: `      - name: Setup Deno
        uses: denoland/setup-deno@v2

      - name: Install dependencies
        run: deno install --frozen`,

  npm: `      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: "22"
          cache: "npm"

      - name: Install dependencies
        run: npm ci`,

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
}

const MATRIX_SCRIPT_ENTRIES: MatrixScriptEntry[] = [
  { name: "lint", script: "check" },
  { args: ["--check"], name: "format", script: "format" },
  { name: "types", script: "typecheck" },
  { name: "monorepo", script: "check:monorepo" },
  { name: "analyze", script: "analyze" },
]

function generateWorkflow({ packageManager, scripts }: WorkflowOptions): string | null {
  const matrixEntries: Array<{ name: string; command: string }> = []

  // Map scripts to matrix entries
  for (const entry of MATRIX_SCRIPT_ENTRIES) {
    if (!scripts.includes(entry.script)) {
      continue
    }

    matrixEntries.push({
      command: runScriptCommand(packageManager, entry.script, {
        args: entry.args,
      }),
      name: entry.name,
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

/** CI-compatible scripts that can be run in GitHub Actions */
const CI_COMPATIBLE_SCRIPTS = new Set<Script>(MATRIX_SCRIPT_ENTRIES.map((entry) => entry.script))

/**
 * Check if any CI-compatible scripts are in the list.
 * CI-compatible scripts are: check, format, typecheck, check:monorepo, analyze
 */
export function hasCICompatibleScripts(scripts: Script[]): boolean {
  return scripts.some((script) => CI_COMPATIBLE_SCRIPTS.has(script))
}

export const github = {
  create: (options: WorkflowOptions) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const workflowDir = path.join(process.cwd(), ".github", "workflows")

      // Create .github/workflows directory if it doesn't exist
      yield* ensureDirectory(workflowDir)

      const workflowContent = generateWorkflow(options)

      if (!workflowContent) {
        return
      }

      const workflowPath = path.join(workflowDir, "adamantite.yml")
      yield* fs
        .writeFileString(workflowPath, workflowContent)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: workflowPath })))
    }),

  exists: () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      return yield* fs.exists(path.join(process.cwd(), ".github", "workflows", "adamantite.yml"))
    }),

  update: (options: WorkflowOptions) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const workflowPath = path.join(process.cwd(), ".github", "workflows", "adamantite.yml")
      const workflowContent = generateWorkflow(options)

      if (!workflowContent) {
        return
      }

      yield* fs
        .writeFileString(workflowPath, workflowContent)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: workflowPath })))
    }),

  workflowPath: ".github/workflows/adamantite.yml",
}
