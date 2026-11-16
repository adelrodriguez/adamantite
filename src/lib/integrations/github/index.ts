import * as Array from "effect/Array"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Yaml from "effect/encoding/Yaml"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import type { Finding, Integration } from "#lib/integrations/base.ts"
import type { Script } from "#lib/project/package-json.ts"
import type { Project } from "#lib/project/project.ts"
import type { Selection } from "#lib/project/selection.ts"
import { getWorkflowTemplate } from "#lib/integrations/github/workflow.macro.ts" with { type: "macro" }
import { getCIWorkflowEntries } from "#lib/project/ci-scripts.ts"
import { DependencyInstaller } from "#lib/project/dependency-installer.ts"
import {
  NodeVersionFile,
  NodeVersionResolver,
  type NodeVersionSource,
} from "#lib/project/node-version-resolver.ts"
import {
  SUPPORTED_PACKAGE_MANAGERS,
  type SupportedPackageManager,
  formatRunScript,
  getRunVerb,
} from "#lib/project/package-manager.ts"
import { FailedToParseYaml } from "#lib/shared/errors.ts"
import { readDirectoryIfExists, readFileIfFile } from "#lib/shared/filesystem.ts"
import { fillTemplate } from "#lib/shared/template.ts"

/**
 * A pattern that matches a package manager command that runs a script that `script` matches, as
 * `formatRunScript` writes it, such as `pnpm run check` or `deno task check`. Flags can come
 * between the package manager and its run verb, such as `pnpm --filter web run check`.
 */
function makeScriptCommandPattern(script: string) {
  return SUPPORTED_PACKAGE_MANAGERS.map((packageManager) => {
    const verb = getRunVerb(packageManager)

    return `${packageManager}(?:\\s+(?!${verb}\\b)\\S+)*\\s+${verb}\\s+${script}`
  }).join("|")
}

const workflowTemplate = getWorkflowTemplate()

const WORKFLOWS_DIRECTORY = ".github/workflows"

/**
 * The workflow that Adamantite writes.
 */
export const WORKFLOW_PATH = `${WORKFLOWS_DIRECTORY}/adamantite.yml`

// Releases before the lockfile let the project rename the workflow, and found its jobs by this
// comment, which the template still holds. A project that renamed it gets no second workflow.
const RENAMED_WORKFLOW_MARKER = "# ADAMANTITE:START"

// Only the parts of a job that the assessment reads. A matrix can be an expression, such as
// `${{ fromJSON(needs.setup.outputs.matrix) }}`, so the matrix decodes on its own.
const Job = Schema.Struct({
  steps: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        run: Schema.optionalKey(Schema.String),
        with: Schema.optionalKey(
          Schema.Struct({
            "node-version": Schema.optionalKey(Schema.Union([Schema.String, Schema.Finite])),
          })
        ),
      })
    )
  ),
  strategy: Schema.optionalKey(Schema.Struct({ matrix: Schema.optionalKey(Schema.Unknown) })),
})

const Workflow = Schema.Struct({ jobs: Schema.Record(Schema.String, Job) })

const Matrix = Schema.Struct({
  include: Schema.Array(Schema.Struct({ command: Schema.optionalKey(Schema.String) })),
})

/**
 * The workflow file that runs the Adamantite jobs: `adamantite.yml`, or a workflow that an earlier
 * release wrote and the project renamed. None when the project has neither.
 */
export const findWorkflow = Effect.fn("findWorkflow")(function* (cwd: string) {
  const path = yield* Path.Path
  const names = yield* readDirectoryIfExists(path.join(cwd, WORKFLOWS_DIRECTORY))

  const workflowPaths = Array.sort(
    Option.getOrElse(names, () => []).filter((name) => /\.ya?ml$/u.test(name)),
    Order.String
  ).map((name) => `${WORKFLOWS_DIRECTORY}/${name}`)

  const workflows = Array.getSomes(
    yield* Effect.forEach(
      workflowPaths,
      (workflowPath) =>
        readFileIfFile(path.join(cwd, workflowPath)).pipe(
          Effect.map((content) =>
            Option.map(content, (text) => ({ content: text, path: workflowPath }))
          )
        ),
      { concurrency: "unbounded" }
    )
  )

  return Array.findFirst(workflows, (workflow) => workflow.path === WORKFLOW_PATH).pipe(
    Option.orElse(() =>
      Array.findFirst(workflows, ({ content }) => content.includes(RENAMED_WORKFLOW_MARKER))
    )
  )
})

/**
 * The commands that the jobs run, from the `run` of each step and the `command` of each matrix
 * `include` entry, and the `node-version` inputs of their steps.
 */
function readJobs(jobs: ReadonlyArray<typeof Job.Type>) {
  const steps = jobs.flatMap((job) => job.steps ?? [])

  const matrixCommands = jobs.flatMap((job) =>
    Option.match(Schema.decodeUnknownOption(Matrix)(job.strategy?.matrix), {
      onNone: () => [],
      onSome: ({ include }) => include.flatMap((entry) => entry.command ?? []),
    })
  )

  return {
    commands: [...steps.flatMap((step) => step.run ?? []), ...matrixCommands],
    nodeVersions: steps.flatMap((step) => step.with?.["node-version"] ?? []),
  }
}

function renderNodeSetup(source: NodeVersionSource): string {
  const versionInput =
    source instanceof NodeVersionFile
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

function renderWorkflow(
  packageManager: SupportedPackageManager,
  scripts: readonly Script[],
  source: NodeVersionSource
) {
  const matrix = getCIWorkflowEntries(packageManager, [...scripts])
    .map((entry) => `          - name: ${entry.name}\n            command: ${entry.command}`)
    .join("\n")

  return fillTemplate(workflowTemplate, {
    matrix,
    setup: getSetupSteps(source)[packageManager],
  })
}

type WorkflowSetup = Data.TaggedEnum<{
  Available: { readonly packageManager: SupportedPackageManager }
  Unavailable: { readonly reason: string }
}>

const { Available, Unavailable } = Data.taggedEnum<WorkflowSetup>()

/**
 * The package manager that the workflow installs with, or why Adamantite cannot write a workflow:
 * the selection runs no script in CI, or Adamantite cannot detect the project's package manager.
 */
const readWorkflowSetup = Effect.fn("readWorkflowSetup")(function* (
  cwd: string,
  { scripts }: Selection
) {
  const entries = getCIWorkflowEntries("npm", [...scripts])

  if (entries.length === 0) {
    return Unavailable({
      reason:
        "No CI script runs an Adamantite command, so Adamantite does not write the GitHub Actions workflow.",
    })
  }

  const detected = yield* (yield* DependencyInstaller).detectPackageManager(cwd)

  return Option.match(detected, {
    onNone: () =>
      Unavailable({
        reason:
          "Could not detect a package manager, so Adamantite does not write the GitHub Actions workflow.",
      }),
    onSome: ({ name }) => Available({ packageManager: name }),
  })
})

const parseJobs = (content: string, path: string) =>
  Effect.try({
    catch: (cause) => new FailedToParseYaml({ cause, path }),
    try: () => Yaml.parse(content),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Workflow)),
    Effect.map(({ jobs }) => Object.values(jobs)),
    Effect.option
  )

/**
 * The findings for the workflow: a missing workflow, and a workflow that the project changed, whose
 * jobs no longer run a CI script of the selection, or that hard-codes a Node.js version.
 */
const assess = Effect.fn("assess")(function* (cwd: string, selection: Selection) {
  const path = yield* Path.Path
  const setup = yield* readWorkflowSetup(cwd, selection)

  if (Predicate.isTagged(setup, "Unavailable")) {
    return { findings: [], packageActions: [], warnings: [setup.reason] }
  }

  const workflow = yield* findWorkflow(cwd)

  if (Option.isNone(workflow)) {
    return {
      findings: [
        {
          currentState: `The selection includes GitHub Actions, and \`${WORKFLOW_PATH}\` does not exist.`,
          goal: [
            `Run \`adamantite update\`. It writes \`${WORKFLOW_PATH}\`.`,
            "Run `adamantite doctor` again. It must not report this finding.",
          ],
          id: "missing-adamantite-workflow",
          integration: "github",
          title: "Missing Adamantite workflow",
        } satisfies Finding,
      ],
      packageActions: [],
      warnings: [],
    }
  }

  const jobs = yield* parseJobs(workflow.value.content, path.join(cwd, workflow.value.path))
  const { commands, nodeVersions } = readJobs(Option.getOrElse(jobs, () => []))
  const hasHardcodedNodeVersion = nodeVersions.some((version) => /^\d/.test(`${version}`))

  const missingScripts = getCIWorkflowEntries(setup.packageManager, [...selection.scripts])
    .map(({ name }) => name)
    .filter((script) => {
      const pattern = new RegExp(String.raw`\b(?:${makeScriptCommandPattern(script)})\b`)

      return !commands.some((command) => pattern.test(command))
    })

  if (!hasHardcodedNodeVersion && missingScripts.length === 0) {
    return { findings: [], packageActions: [], warnings: [] }
  }

  return {
    findings: [
      {
        currentState: [
          ...(hasHardcodedNodeVersion
            ? [`The jobs in \`${workflow.value.path}\` contain a hard-coded Node.js version.`]
            : []),
          ...missingScripts.map(
            (script) =>
              `No job in \`${workflow.value.path}\` runs the managed \`${script}\` script.`
          ),
        ].join(" "),
        goal: [
          ...missingScripts.map(
            (script) =>
              `Make a job run the managed \`${script}\` script with \`${formatRunScript(setup.packageManager, script)}\`.`
          ),
          "Use the project's Node.js version declaration instead of a hard-coded version.",
        ],
        id: "outdated-adamantite-workflow",
        integration: "github",
        notes: [
          `The detected package manager is \`${setup.packageManager}\`.`,
          "Preserve the other jobs and project-specific settings.",
        ],
        title: "Outdated Adamantite workflow",
      } satisfies Finding,
    ],
    packageActions: [],
    warnings: [],
  }
})

export default {
  assess: ({ cwd }: Project, selection: Selection) => assess(cwd, selection),
  // A project that renamed the workflow keeps it, so the rename does not run its jobs twice.
  files: ({ cwd }: Project, selection: Selection) =>
    Effect.gen(function* () {
      const setup = yield* readWorkflowSetup(cwd, selection)
      const workflow = yield* findWorkflow(cwd)

      if (
        Predicate.isTagged(setup, "Unavailable")
        || Option.exists(workflow, ({ path }) => path !== WORKFLOW_PATH)
      ) {
        return []
      }

      const source = yield* (yield* NodeVersionResolver).resolve(cwd)

      return [
        {
          content: renderWorkflow(setup.packageManager, selection.scripts, source),
          path: WORKFLOW_PATH,
        },
      ]
    }),
  name: "github",
  packages: (_project: Project, _selection: Selection) => [],
  prepare: (_project: Project) => Effect.void,
  selected: ({ ci }: Selection) => ci === "github",
} satisfies Integration
