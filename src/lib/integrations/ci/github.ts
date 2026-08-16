import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import type { Script, SupportedPackageManager } from "#lib/workspace/package-json.ts"
import { defineIntegration } from "#lib/integrations/base.ts"
import { FailedToWriteFile } from "#lib/shared/errors.ts"
import { ensureDirectory } from "#lib/shared/filesystem.ts"
import { getCIWorkflowEntries } from "#lib/workspace/ci-scripts.ts"
import {
  type NodeVersionSource,
  NodeVersionResolver,
} from "#lib/workspace/node-version-resolver.ts"

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
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const resolver = yield* NodeVersionResolver
    const workflowPath = path.join(cwd, files[0].path)

    const source = yield* resolver.resolve(cwd)
    const workflowContent = generateWorkflow(options, source)

    if (!workflowContent) {
      return
    }

    yield* fs
      .writeFileString(workflowPath, workflowContent)
      .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: workflowPath })))
  })

export default defineIntegration({
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
