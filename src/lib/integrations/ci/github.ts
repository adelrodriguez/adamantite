import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import type { Script, SupportedPackageManager } from "#lib/workspace/package-json.ts"
import {
  defineIntegration,
  type Finding,
  type IntegrationAssessment,
} from "#lib/integrations/base.ts"
import { ensureDirectory, readFileIfExists, writeFile } from "#lib/shared/filesystem.ts"
import {
  getCIWorkflowEntries,
  hasCICompatibleScripts,
  RULE_TEST_COMMANDS,
} from "#lib/workspace/ci-scripts.ts"
import { listCustomRuleTests } from "#lib/workspace/custom-rules/index.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import {
  type NodeVersionSource,
  NodeVersionResolver,
} from "#lib/workspace/node-version-resolver.ts"
import { checkIsSupportedPackageManager, getManagedScripts } from "#lib/workspace/package-json.ts"

const HARDCODED_NODE_VERSION_REGEX = /^\s*node-version:\s*"?\d/m
const BLOCK_SCALAR_REGEX = /^[>|](?:[1-9][+-]?|[+-][1-9]?)?(?:\s+#.*)?$/
const CHECK_COMMAND_REGEX =
  /\b(?:(?:bun|npm|pnpm|yarn)(?:\s+(?!run\b)\S+)*\s+run\s+check|deno(?:\s+(?!task\b)\S+)*\s+task\s+check)\b/
const FORMAT_CHECK_COMMAND_REGEX =
  /\b(?:(?:bun|npm|pnpm|yarn)(?:\s+(?!run\b)\S+)*\s+run\s+format|deno(?:\s+(?!task\b)\S+)*\s+task\s+format)(?:\s+--)?\s+--check\b/
const MONOREPO_COMMAND_REGEX =
  /\b(?:(?:bun|npm|pnpm|yarn)(?:\s+(?!run\b)\S+)*\s+run\s+(?:check|fix):monorepo|deno(?:\s+(?!task\b)\S+)*\s+task\s+(?:check|fix):monorepo|adamantite\s+monorepo)(?=\s|$)/
const RULE_TEST_COMMAND_REGEX = /\badamantite\s+rule\s+test(?=\s|$)/
const WORKFLOW_COMMAND_REGEX = /^(\s*)(?:-\s*)?(?:command|run):\s*(.*)$/
// A YAML value in single or double quotes, such as `run: "pnpm exec adamantite rule test"`.
const QUOTED_VALUE_REGEX = /^(["'])(.*)\1$/

interface WorkflowOptions {
  packageManager: SupportedPackageManager
  scripts: Script[]
}

function hasWorkflowCommand(content: string, commandRegex: RegExp): boolean {
  const lines = content.split("\n")

  for (const [index, line] of lines.entries()) {
    const match = WORKFLOW_COMMAND_REGEX.exec(line)

    if (!match) {
      continue
    }

    const indentation = match[1]?.length ?? 0
    const value = (match[2] ?? "").trim()
    const command = QUOTED_VALUE_REGEX.exec(value)?.[2] ?? value

    if (commandRegex.test(command)) {
      return true
    }

    if (!BLOCK_SCALAR_REGEX.test(command)) {
      continue
    }

    for (const blockLine of lines.slice(index + 1)) {
      const trimmed = blockLine.trim()

      if (trimmed.length === 0) {
        continue
      }

      const blockIndentation = blockLine.length - blockLine.trimStart().length

      if (blockIndentation <= indentation) {
        break
      }

      if (commandRegex.test(trimmed)) {
        return true
      }
    }
  }

  return false
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

// `adamantite rule test` runs `node --test`, so a Deno workflow with rule tests also sets up Node.js.
function getSetupSteps(source: NodeVersionSource, hasRuleTests: boolean) {
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
    deno: `${hasRuleTests ? `${renderNodeSetup(source)}\n\n` : ""}      - name: Setup Deno
        uses: denoland/setup-deno@v2

      - name: Install dependencies
        run: deno install --frozen`,
    npm: `${renderNodeSetup(source)}
          cache: "npm"

      - name: Install dependencies
        run: npm ci`,
    pnpm: `      - name: Setup pnpm
        uses: pnpm/action-setup@v6

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
  { hasRuleTests, packageManager, scripts }: WorkflowOptions & { hasRuleTests: boolean },
  source: NodeVersionSource
): string | null {
  const matrixEntries = getCIWorkflowEntries(packageManager, scripts, { hasRuleTests })

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

${getSetupSteps(source, hasRuleTests)[packageManager]}

      - name: Run \${{ matrix.name }}
        run: \${{ matrix.command }}`

  return `${workflow}\n`
}

const legacyFormatStepFinding: Finding = {
  currentState: "The workflow still runs the legacy `format` script with `--check`.",
  goal: ["Remove the workflow step or matrix entry that runs the `format` script with `--check`."],
  id: "legacy-format-workflow-step",
  integration: "github",
  notes: [
    "The managed `check` script verifies formatting. Preserve unrelated workflow jobs and project-specific settings.",
  ],
  title: "Legacy format workflow step",
}

const legacyMonorepoStepFinding: Finding = {
  currentState: "The workflow still runs a legacy monorepo script or `adamantite monorepo`.",
  goal: [
    "Remove the workflow step or matrix entry that runs `check:monorepo`, `fix:monorepo`, or `adamantite monorepo`.",
    "Make the workflow run the managed `analyze` script. It runs Sherif in a detected monorepo.",
  ],
  id: "legacy-monorepo-workflow-step",
  integration: "github",
  notes: ["Preserve unrelated workflow jobs and project-specific settings."],
  title: "Legacy monorepo workflow step",
}

const files = [{ path: ".github/workflows/adamantite.yml", type: "ci" }] as const

const writeWorkflow = (cwd: string, options: WorkflowOptions) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const resolver = yield* NodeVersionResolver
    const workflowPath = path.join(cwd, files[0].path)

    const source = yield* resolver.resolve(cwd)
    const { tests: ruleTests } = yield* listCustomRuleTests(cwd)
    const workflowContent = generateWorkflow(
      { ...options, hasRuleTests: ruleTests.length > 0 },
      source
    )

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
        managedScripts.includes("check") && !hasWorkflowCommand(content.value, CHECK_COMMAND_REGEX)
      const hasRuleTests = (yield* listCustomRuleTests(cwd)).tests.length > 0
      const isMissingRuleTestCommand =
        hasRuleTests && !hasWorkflowCommand(content.value, RULE_TEST_COMMAND_REGEX)
      const legacyFindings = [
        ...(hasWorkflowCommand(content.value, FORMAT_CHECK_COMMAND_REGEX)
          ? [legacyFormatStepFinding]
          : []),
        ...(hasWorkflowCommand(content.value, MONOREPO_COMMAND_REGEX)
          ? [legacyMonorepoStepFinding]
          : []),
      ]

      if (!hasHardcodedNodeVersion && !isMissingCheckCommand && !isMissingRuleTestCommand) {
        return {
          applicable: true,
          findings: legacyFindings,
          packageActions: [],
          warnings: [],
        } satisfies IntegrationAssessment
      }

      // The `rule test` entry needs no managed script, so it alone lets Adamantite regenerate the
      // workflow.
      if (!hasCICompatibleScripts(managedScripts) && !hasRuleTests) {
        return {
          applicable: true,
          findings: legacyFindings,
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
          findings: legacyFindings,
          packageActions: [],
          warnings: [
            "Could not detect a package manager, so the GitHub Actions workflow cannot be regenerated.",
          ],
        } satisfies IntegrationAssessment
      }

      if (!checkIsSupportedPackageManager(detectedPackageManager.name)) {
        return {
          applicable: true,
          findings: legacyFindings,
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
              ...(isMissingRuleTestCommand
                ? [
                    "The workflow does not run `adamantite rule test`, and the project has custom rule tests.",
                  ]
                : []),
            ].join(" "),
            goal: [
              "Make the workflow run the managed `check` script.",
              ...(hasRuleTests
                ? [
                    "Make the workflow run `adamantite rule test`, so that CI runs the custom rule tests.",
                  ]
                : []),
              "Use the project's Node.js version declaration instead of a hard-coded version.",
            ],
            id: "outdated-adamantite-workflow",
            integration: "github",
            notes: [
              `The detected package manager is \`${detectedPackageManager.name}\`. Preserve unrelated workflow jobs and project-specific settings.`,
              ...(hasRuleTests
                ? [
                    `With \`${detectedPackageManager.name}\`, run the custom rule tests with \`${RULE_TEST_COMMANDS[detectedPackageManager.name]}\`.`,
                  ]
                : []),
              ...(hasRuleTests && detectedPackageManager.name === "deno"
                ? [
                    "`adamantite rule test` runs the tests with Node.js 22.18 or later, so the Deno workflow also needs an `actions/setup-node` step before the tests run.",
                  ]
                : []),
            ],
            title: "Outdated Adamantite workflow",
          },
          ...legacyFindings,
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
