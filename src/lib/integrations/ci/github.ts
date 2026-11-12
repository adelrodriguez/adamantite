import * as Array from "effect/Array"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Yaml from "effect/encoding/Yaml"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"
import { runScriptCommand } from "nypm"
import type { Script, SupportedPackageManager } from "#lib/workspace/package-json.ts"
import type { Project } from "#lib/workspace/project.ts"
import { defineIntegration, type IntegrationAssessment } from "#lib/integrations/base.ts"
import {
  Block,
  END_MARKER,
  MalformedBlock,
  START_MARKER,
  readBlock,
  replaceBlock,
} from "#lib/integrations/ci/github-block.ts"
import { getWorkflowTemplate } from "#lib/integrations/ci/github-workflow.macro.ts" with { type: "macro" }
import { FailedToParseYaml } from "#lib/shared/errors.ts"
import {
  ensureDirectory,
  readDirectoryIfExists,
  readFileIfFile,
  writeFile,
} from "#lib/shared/filesystem.ts"
import { fillTemplate } from "#lib/shared/template.ts"
import {
  getCIScriptSets,
  getCIWorkflowEntries,
  hasCICompatibleScripts,
} from "#lib/workspace/ci-scripts.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import {
  NODE_VERSION_SOURCES,
  NodeVersionFile,
  NodeVersionResolver,
  type NodeVersionSource,
} from "#lib/workspace/node-version-resolver.ts"
import {
  checkIsSupportedPackageManager,
  getManagedScripts,
  SUPPORTED_PACKAGE_MANAGERS,
} from "#lib/workspace/package-json.ts"

/**
 * A pattern that matches a package manager command that runs a script that `script` matches, as
 * `runScriptCommand` writes it, such as `pnpm run check` or `deno task check`. Flags can come
 * between the package manager and its run verb, such as `pnpm --filter web run check`.
 */
function makeScriptCommandPattern(script: string) {
  return SUPPORTED_PACKAGE_MANAGERS.map((packageManager) => {
    const [binary, verb] = runScriptCommand(packageManager, "script").split(" ")

    return `${binary}(?:\\s+(?!${verb}\\b)\\S+)*\\s+${verb}\\s+${script}`
  }).join("|")
}

const CHECK_COMMAND_REGEX = new RegExp(String.raw`\b(?:${makeScriptCommandPattern("check")})\b`)

const workflowTemplate = getWorkflowTemplate()

const WORKFLOWS_DIRECTORY = ".github/workflows"

// The workflow file that `create` writes.
const files = [{ path: `${WORKFLOWS_DIRECTORY}/adamantite.yml`, type: "ci" }] as const

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

interface WorkflowOptions {
  packageManager: SupportedPackageManager
  scripts: Script[]
}

/**
 * No workflow file holds managed jobs.
 */
class MissingWorkflow extends Data.TaggedClass("Missing") {}

/**
 * The workflow file with the managed block, and the jobs in the block.
 */
class ManagedWorkflow extends Data.TaggedClass("Managed")<{
  readonly block: Block
  readonly jobs: ReadonlyArray<typeof Job.Type>
  readonly path: string
}> {}

/**
 * An `adamantite.yml` without markers. Releases before the managed block wrote only managed jobs
 * into it, so all its jobs are managed. A legacy workflow that does not parse has jobs that run
 * nothing.
 */
class LegacyWorkflow extends Data.TaggedClass("Legacy")<{
  readonly content: string
  readonly jobs: ReadonlyArray<typeof Job.Type>
  readonly path: string
}> {}

/**
 * Markers that do not make one managed block in one workflow file.
 */
class MalformedWorkflow extends Data.TaggedClass("Malformed")<{
  readonly paths: readonly string[]
  readonly reason: string
}> {}

const parseYaml = (content: string, path: string) =>
  Effect.try({
    catch: (cause) => new FailedToParseYaml({ cause, path }),
    try: () => Yaml.parse(content),
  })

const parseJobs = (content: string, path: string) =>
  parseYaml(content, path).pipe(
    Effect.flatMap((parsed) => Schema.decodeUnknownEffect(Workflow)(parsed)),
    Effect.map(({ jobs }) => Object.values(jobs)),
    Effect.option
  )

// The jobs of a workflow by name, also of a workflow whose `jobs` key has no jobs yet.
const JobNames = Schema.Struct({
  jobs: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
})

const readJobsByName = (content: string, path: string) =>
  parseYaml(content, path).pipe(
    Effect.flatMap((parsed) => Schema.decodeUnknownEffect(JobNames)(parsed)),
    Effect.map(({ jobs }) => jobs ?? {})
  )

/**
 * The jobs in a managed block. The text up to the end of the block parses with the anchors that the
 * jobs can use, and the jobs that the text before the block does not have are the managed jobs.
 */
const parseBlockJobs = (block: Block, path: string) =>
  Effect.gen(function* () {
    const before = block.before.replaceAll("\r", "")

    const jobsBefore = yield* readJobsByName(before, path)

    const jobsWithBlock = yield* readJobsByName(
      `${before}\n${block.body.replaceAll("\r", "")}`,
      path
    )

    // Only the managed jobs decode, so a project job of another shape does not fail the block.
    return yield* Schema.decodeUnknownEffect(Schema.Array(Job))(
      Object.entries(jobsWithBlock).flatMap(([name, job]) =>
        Record.has(jobsBefore, name) ? [] : [job]
      )
    )
  }).pipe(Effect.option)

/**
 * The workflow files in `.github/workflows` that hold managed jobs. A project has one managed
 * block. A legacy `adamantite.yml` counts only when no file has a block.
 */
const readWorkflowState = (cwd: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const names = yield* readDirectoryIfExists(path.join(cwd, WORKFLOWS_DIRECTORY))

    const workflowPaths = Array.sort(
      Option.getOrElse(names, () => []).filter((name) => /\.ya?ml$/u.test(name)),
      Order.String
    ).map((name) => `${WORKFLOWS_DIRECTORY}/${name}`)

    const workflows = Array.getSomes(
      yield* Effect.forEach(workflowPaths, (workflowPath) =>
        readFileIfFile(path.join(cwd, workflowPath)).pipe(
          Effect.map((content) =>
            Option.map(content, (text) => ({
              block: readBlock(text),
              content: text,
              path: workflowPath,
            }))
          )
        )
      )
    )

    const [malformed] = workflows.flatMap(({ block, path: workflowPath }) =>
      block instanceof MalformedBlock ? [{ path: workflowPath, reason: block.reason }] : []
    )

    if (malformed) {
      return new MalformedWorkflow({ paths: [malformed.path], reason: malformed.reason })
    }

    const blocks = workflows.flatMap(({ block, path: workflowPath }) =>
      block instanceof Block ? [{ block, path: workflowPath }] : []
    )

    if (blocks.length > 1) {
      return new MalformedWorkflow({
        paths: blocks.map((managed) => managed.path),
        reason: "More than one workflow file has a managed block.",
      })
    }

    const [managed] = blocks

    if (managed) {
      const jobs = yield* parseBlockJobs(managed.block, path.join(cwd, managed.path))

      return Option.match(jobs, {
        onNone: () =>
          new MalformedWorkflow({
            paths: [managed.path],
            reason: "The jobs between the markers do not parse as workflow jobs.",
          }),
        onSome: (managedJobs) =>
          new ManagedWorkflow({ block: managed.block, jobs: managedJobs, path: managed.path }),
      })
    }

    const legacy = workflows.find((workflow) => workflow.path === files[0].path)

    if (legacy) {
      const jobs = yield* parseJobs(legacy.content, path.join(cwd, legacy.path))

      return new LegacyWorkflow({
        content: legacy.content,
        jobs: Option.getOrElse(jobs, () => []),
        path: legacy.path,
      })
    }

    return new MissingWorkflow()
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

  return fillTemplate(workflowTemplate, {
    end: END_MARKER,
    matrix: matrixInclude,
    setup: getSetupSteps(source)[packageManager],
    start: START_MARKER,
  })
}

/**
 * The body of the managed block of a workflow that `generateWorkflow` wrote.
 */
function readGeneratedBody(workflow: string) {
  const block = readBlock(workflow)

  // The template holds one block, and a unit test renders it.
  if (!(block instanceof Block)) {
    throw new TypeError("The GitHub Actions workflow template has no managed block.")
  }

  return block.body
}

// Every workflow that `create` could have written, for any package manager, set of CI scripts, and
// Node.js version source. The source can differ from the current one, because the project can add
// or remove a version file after init.
function listGeneratedWorkflows() {
  return NODE_VERSION_SOURCES.flatMap((source) =>
    Record.keys(getSetupSteps(source)).flatMap((packageManager) =>
      getCIScriptSets().flatMap(
        (scripts) => generateWorkflow({ packageManager, scripts }, source) ?? []
      )
    )
  )
}

// Line endings and trailing blank lines change with a checkout or an editor, not with a choice of
// the project, so the comparisons ignore them.
function normalizeWorkflowText(content: string) {
  return content.replaceAll("\r\n", "\n").replaceAll("\r", "").trimEnd()
}

/**
 * Whether `create` could have written this managed block body. Any other body, such as one with a
 * hard-coded Node.js version, holds choices that the project made, so `update` keeps it.
 */
function checkIsGeneratedBody(body: string) {
  const normalized = normalizeWorkflowText(body)

  return listGeneratedWorkflows().some(
    (workflow) => normalizeWorkflowText(readGeneratedBody(workflow)) === normalized
  )
}

/**
 * Whether a release before the managed block could have written this workflow. Those releases wrote
 * the same workflow without the two marker lines.
 */
function checkIsGeneratedLegacyWorkflow(content: string) {
  const normalized = normalizeWorkflowText(content)

  return listGeneratedWorkflows().some(
    (workflow) =>
      normalizeWorkflowText(
        workflow
          .split("\n")
          .filter((line) => line.trim() !== START_MARKER && line.trim() !== END_MARKER)
          .join("\n")
      ) === normalized
  )
}

export default defineIntegration({
  assess: ({ cwd, packageJson }: Project) =>
    Effect.gen(function* () {
      const state = yield* readWorkflowState(cwd)

      if (state instanceof MissingWorkflow) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      if (state instanceof MalformedWorkflow) {
        return {
          applicable: true,
          findings: [
            {
              currentState: `Adamantite cannot read the managed block in ${state.paths.map((workflowPath) => `\`${workflowPath}\``).join(", ")}. ${state.reason}`,
              goal: [
                `Put the jobs that run the Adamantite scripts between one \`${START_MARKER}\` comment and one \`${END_MARKER}\` comment, in one workflow file.`,
              ],
              id: "malformed-adamantite-workflow",
              integration: "github",
              notes: ["Preserve the other jobs and project-specific settings."],
              title: "Malformed Adamantite workflow block",
            },
          ],
          packageActions: [],
          warnings: [],
        } satisfies IntegrationAssessment
      }

      const managedScripts = getManagedScripts(packageJson)
      const workflow = readJobs(state.jobs)

      const hasHardcodedNodeVersion = workflow.nodeVersions.some((version) =>
        /^\d/.test(String(version))
      )

      const isMissingCheckCommand =
        managedScripts.includes("check")
        && !workflow.commands.some((command) => CHECK_COMMAND_REGEX.test(command))

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
                ? [`The managed jobs in \`${state.path}\` contain a hard-coded Node.js version.`]
                : []),
              ...(isMissingCheckCommand
                ? [`The managed jobs in \`${state.path}\` do not run the managed \`check\` script.`]
                : []),
            ].join(" "),
            goal: [
              ...(managedScripts.includes("check")
                ? ["Make a managed job run the managed `check` script."]
                : []),
              "Use the project's Node.js version declaration instead of a hard-coded version.",
            ],
            id: "outdated-adamantite-workflow",
            integration: "github",
            notes: [
              `The detected package manager is \`${detectedPackageManager.name}\`.`,
              state instanceof LegacyWorkflow
                ? `\`${state.path}\` has no \`${START_MARKER}\` and \`${END_MARKER}\` comments, so Adamantite checks all its jobs. Put the jobs that run the Adamantite scripts between these comments, and preserve the other jobs and project-specific settings.`
                : `Adamantite checks only the jobs between \`${START_MARKER}\` and \`${END_MARKER}\`. Change only those jobs, and preserve the other jobs and project-specific settings.`,
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
      const resolver = yield* NodeVersionResolver
      const workflowPath = path.join(cwd, files[0].path)
      const workflow = generateWorkflow(options, yield* resolver.resolve(cwd))

      if (workflow === null) {
        return
      }

      yield* ensureDirectory(path.dirname(workflowPath))
      yield* writeFile(workflowPath, workflow)
    }),
  /**
   * The workflow file that holds the managed jobs, or why there is none.
   */
  detect: readWorkflowState,
  files,
  kind: "ci",
  name: "github",
  /**
   * Rewrites the managed jobs when Adamantite generated them. In a workflow with a managed block,
   * the rest of the file stays as the project wrote it.
   */
  update: (cwd: string, options: WorkflowOptions) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const resolver = yield* NodeVersionResolver
      const state = yield* readWorkflowState(cwd)
      const workflow = generateWorkflow(options, yield* resolver.resolve(cwd))

      if (workflow === null || state instanceof MalformedWorkflow) {
        return "kept" as const
      }

      if (state instanceof MissingWorkflow) {
        yield* writeFile(path.join(cwd, files[0].path), workflow)

        return "updated" as const
      }

      if (state instanceof LegacyWorkflow) {
        if (!checkIsGeneratedLegacyWorkflow(state.content)) {
          return "kept" as const
        }

        yield* writeFile(path.join(cwd, state.path), workflow)

        return "updated" as const
      }

      if (!checkIsGeneratedBody(state.block.body)) {
        return "kept" as const
      }

      // Keep the line endings of the file. Each line of a CRLF body keeps its carriage return.
      const body = readGeneratedBody(workflow)
      const isCrlf = state.block.before.endsWith("\r")

      yield* writeFile(
        path.join(cwd, state.path),
        replaceBlock(state.block, isCrlf ? `${body.replaceAll("\n", "\r\n")}\r` : body)
      )

      return "updated" as const
    }),
})
