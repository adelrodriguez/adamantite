import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import { Fault } from "faultier"
import { fromPromise, ok, safeTry } from "neverthrow"
import { checkIfExists, mergeConfig, parseJson } from "#utils.ts"

type PackageManager = "npm" | "yarn" | "pnpm" | "bun"

interface WorkflowOptions {
  packageManager: PackageManager
  scripts: string[]
}

const getSetupSteps = (packageManager: PackageManager): string => {
  switch (packageManager) {
    case "bun":
      return `      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile`

    case "pnpm":
      return `      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile`

    case "yarn":
      return `      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "yarn"

      - name: Install dependencies
        run: yarn install --frozen-lockfile`

    case "npm":
    default:
      return `      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - name: Install dependencies
        run: npm ci`
  }
}

const getRunCommand = (packageManager: PackageManager, script: string): string => {
  switch (packageManager) {
    case "bun":
      return `bun run ${script}`
    case "pnpm":
      return `pnpm run ${script}`
    case "yarn":
      return `yarn ${script}`
    case "npm":
    default:
      return `npm run ${script}`
  }
}

const generateJob = (
  jobName: string,
  stepName: string,
  script: string,
  packageManager: PackageManager
): string => {
  return `
  ${jobName}:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

${getSetupSteps(packageManager)}

      - name: ${stepName}
        run: ${getRunCommand(packageManager, script)}`
}

const generateWorkflow = ({ packageManager, scripts }: WorkflowOptions): string => {
  const jobs: string[] = []

  // Map scripts to jobs
  if (scripts.includes("check")) {
    jobs.push(generateJob("lint", "Run linter", "check", packageManager))
  }

  if (scripts.includes("format")) {
    jobs.push(generateJob("format", "Check formatting", "format", packageManager))
  }

  if (scripts.includes("typecheck")) {
    jobs.push(generateJob("typecheck", "Run type check", "typecheck", packageManager))
  }

  if (scripts.includes("check:monorepo")) {
    jobs.push(generateJob("monorepo", "Check monorepo", "check:monorepo", packageManager))
  }

  const workflow = `name: CI

on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened]

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:${jobs.join("\n")}`

  return `${workflow}\n`
}

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

      yield* fromPromise(
        writeFile(join(workflowDir, "adamantite.yml"), workflowContent),
        (error) =>
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
