import { describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Effect from "effect/Effect"
import * as Yaml from "effect/encoding/Yaml"
import * as Layer from "effect/Layer"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { Block, readBlock } from "#lib/integrations/ci/github-block.ts"
import github from "#lib/integrations/ci/github.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import {
  NodeVersion,
  NodeVersionFile,
  NodeVersionResolver,
  type NodeVersionSource,
} from "#lib/workspace/node-version-resolver.ts"
import {
  SUPPORTED_PACKAGE_MANAGERS,
  type SupportedPackageManager,
} from "#lib/workspace/package-json.ts"
import { readProject } from "#lib/workspace/project.ts"
import testWorkflow from "../../../../../.github/workflows/test.yml?raw"

const ROOT = "/project"

const WORKFLOW_PATH = ".github/workflows/adamantite.yml"

// A rules folder that `custom()` loads, with one rule and no test.
const RULE_FILES = {
  ".adamantite/lint/no-a.ts": "export default {}\n",
  "oxlint.config.ts": [
    'import custom from "adamantite/rules"',
    'import { defineConfig } from "oxlint"',
    "",
    "export default defineConfig({ extends: [custom()] })",
    "",
  ].join("\n"),
}

const RULE_TEST_FILES = { ...RULE_FILES, ".adamantite/lint/no-a.test.ts": "// test\n" }

const PACKAGE_JSON_WITH_SCRIPTS = JSON.stringify({
  scripts: { analyze: "adamantite analyze", check: "adamantite check" },
})

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({
    files: { "package.json": JSON.stringify({ name: "app" }), ...files },
    root: ROOT,
  })
}

function makeResolverLayer(source: NodeVersionSource) {
  return Layer.succeed(NodeVersionResolver)({
    resolve: () => Effect.succeed(source),
  })
}

function provideFallback(files: FileSystemTestContext) {
  return Effect.provide([
    files.layer,
    Path.layer,
    makeModuleResolverLayer(ROOT),
    makeResolverLayer(new NodeVersion({ value: "lts/*" })),
  ])
}

function provideAssessment(
  files: FileSystemTestContext,
  packageManager: SupportedPackageManager = "pnpm"
) {
  return Effect.provide([
    files.layer,
    Path.layer,
    makeModuleResolverLayer(ROOT),
    Layer.succeed(DependencyInstaller)({
      addDevDependencies: () => Effect.void,
      detectPackageManager: () => Effect.succeed({ name: packageManager }),
    }),
  ])
}

// A workflow with one job that runs these steps.
function makeWorkflow(...steps: string[]) {
  return [
    "on: push",
    "jobs:",
    "  verify:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    ...steps.map((line) => `      ${line}`),
    "",
  ].join("\n")
}

// A workflow with one job that runs `${{ matrix.command }}` for these matrix entries.
function makeMatrixWorkflow(...entries: Array<{ command: string; name: string }>) {
  return [
    "on: push",
    "jobs:",
    "  verify:",
    "    runs-on: ubuntu-latest",
    "    strategy:",
    "      matrix:",
    "        include:",
    ...entries.flatMap(({ command, name }) => [
      `          - name: ${name}`,
      `            command: ${command}`,
    ]),
    "    steps:",
    `      - run: \${{ matrix.command }}`,
    "",
  ].join("\n")
}

// A workflow with a renamed file, as a project can keep it.
const RENAMED_WORKFLOW_PATH = ".github/workflows/checks.yml"

// A job that the project added after the managed block, with a Node.js version that it chose.
const PROJECT_JOB = [
  "  e2e:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - uses: actions/setup-node@v7",
  "        with:",
  '          node-version: "22"',
  "      - run: pnpm run test:e2e",
  "",
].join("\n")

// The project's name for the workflow, outside the managed block.
function renameWorkflow(workflow: string) {
  return workflow.replace("name: adamantite", "name: checks")
}

// A workflow whose managed block holds one job that runs these steps.
function makeBlockWorkflow(...steps: string[]) {
  return [
    "on: push",
    "jobs:",
    "  # ADAMANTITE:START",
    "  verify:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    ...steps.map((line) => `      ${line}`),
    "  # ADAMANTITE:END",
    "",
  ].join("\n")
}

const GeneratedWorkflow = Schema.Struct({
  jobs: Schema.Struct({
    verify: Schema.Struct({
      steps: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          run: Schema.optionalKey(Schema.String),
          uses: Schema.optionalKey(Schema.String),
          with: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
        })
      ),
      strategy: Schema.Struct({
        matrix: Schema.Struct({
          include: Schema.Array(Schema.Struct({ command: Schema.String, name: Schema.String })),
        }),
      }),
    }),
  }),
})

function readGeneratedWorkflow(files: FileSystemTestContext) {
  return Schema.decodeUnknownSync(GeneratedWorkflow)(Yaml.parse(files.read(WORKFLOW_PATH))).jobs
    .verify
}

function getMatrixJobs(files: FileSystemTestContext) {
  return readGeneratedWorkflow(files).strategy.matrix.include
}

function getSetupNodeInputs(files: FileSystemTestContext) {
  return readGeneratedWorkflow(files).steps.find((step) => step.name === "Setup Node.js")?.with
}

// The workflow that `create` writes for pnpm and these scripts.
function generateWorkflow(scripts: Array<"analyze" | "check">) {
  return Effect.gen(function* () {
    const files = makeFiles()

    yield* github.create(ROOT, { packageManager: "pnpm", scripts }).pipe(provideFallback(files))

    return files.read(WORKFLOW_PATH)
  })
}

function assessFiles(files: FileSystemTestContext) {
  return readProject(ROOT).pipe(
    Effect.flatMap((project) => github.assess(project)),
    provideAssessment(files)
  )
}

function provideFileResolver(files: FileSystemTestContext) {
  return Effect.provide([
    files.layer,
    Path.layer,
    makeModuleResolverLayer(ROOT),
    makeResolverLayer(new NodeVersionFile({ path: ".node-version" })),
  ])
}

function getPinnedActions(workflow: string) {
  const pins = new Map<string, string>()

  for (const [, action, ref] of workflow.matchAll(/uses: ([^@\s]+)@(\S+)/g)) {
    if (action && ref) {
      pins.set(action, ref)
    }
  }

  return pins
}

function expectNodeVersionFileWorkflow(packageManager: "bun" | "npm" | "pnpm" | "yarn") {
  return Effect.gen(function* () {
    const files = makeFiles()

    yield* github
      .create(ROOT, {
        packageManager,
        scripts: ["check"],
      })
      .pipe(provideFileResolver(files))

    expect(getSetupNodeInputs(files)).toMatchObject({ "node-version-file": ".node-version" })
    expect(getSetupNodeInputs(files)).not.toHaveProperty("node-version")
  })
}

describe("github", () => {
  describe("assess", () => {
    // The managed check script, which each workflow assessment reads from package.json.
    const PACKAGE_JSON = JSON.stringify({ scripts: { check: "adamantite check" } })

    it.effect("report hard-coded Node.js and a missing check command", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow(
            "- uses: actions/setup-node@v7",
            "  with:",
            '    node-version: "22"',
            "- run: pnpm format"
          ),
          "package.json": PACKAGE_JSON,
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => github.assess(project)),
          provideAssessment(files)
        )

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              currentState: expect.stringMatching(/hard-coded Node\.js version\..*`check` script/u),
              id: "outdated-adamantite-workflow",
            },
          ],
        })
      })
    )

    it.effect("do not create a finding when the workflow is absent", () =>
      Effect.gen(function* () {
        const files = makeFiles({ "package.json": PACKAGE_JSON })
        expect(
          yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toStrictEqual({
          applicable: false,
        })
      })
    )

    it.effect("check only the jobs in the managed block of a renamed workflow", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [RENAMED_WORKFLOW_PATH]: `${makeBlockWorkflow("- run: pnpm run check")}${PROJECT_JOB}`,
          "package.json": PACKAGE_JSON,
        })

        expect(yield* assessFiles(files)).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("not count a check command in a job outside the managed block", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [RENAMED_WORKFLOW_PATH]: [
            makeBlockWorkflow("- run: pnpm run format"),
            "  lint:",
            "    runs-on: ubuntu-latest",
            "    steps:",
            "      - run: pnpm run check",
            "",
          ].join("\n"),
          "package.json": PACKAGE_JSON,
        })

        expect(yield* assessFiles(files)).toMatchObject({
          findings: [
            {
              currentState:
                "The managed jobs in `.github/workflows/checks.yml` do not run the managed `check` script.",
              id: "outdated-adamantite-workflow",
              notes: expect.arrayContaining([
                expect.stringContaining("checks only the jobs between `# ADAMANTITE:START`"),
              ]),
            },
          ],
        })
      })
    )

    it.effect("read a managed job that uses an anchor from above the managed block", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [RENAMED_WORKFLOW_PATH]: [
            "on: push",
            "jobs:",
            "  lint:",
            "    runs-on: ubuntu-latest",
            "    steps: &check_steps",
            "      - run: pnpm run check",
            "  # ADAMANTITE:START",
            "  verify:",
            "    runs-on: ubuntu-latest",
            "    steps: *check_steps",
            "  # ADAMANTITE:END",
            "",
          ].join("\n"),
          "package.json": PACKAGE_JSON,
        })

        expect(yield* assessFiles(files)).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("not count a check command in a job above the managed block", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [RENAMED_WORKFLOW_PATH]: makeBlockWorkflow("- run: pnpm run format").replace(
            "jobs:\n",
            "jobs:\n  lint:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm run check\n"
          ),
          "package.json": PACKAGE_JSON,
        })

        expect(yield* assessFiles(files)).toMatchObject({
          findings: [{ id: "outdated-adamantite-workflow" }],
        })
      })
    )

    it.effect("ask to add the markers to a legacy workflow that needs a repair", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow("- run: pnpm format"),
          "package.json": PACKAGE_JSON,
        })

        expect(yield* assessFiles(files)).toMatchObject({
          findings: [
            {
              notes: expect.arrayContaining([
                expect.stringContaining("so Adamantite checks all its jobs"),
              ]),
            },
          ],
        })
      })
    )

    it.effect("not manage a renamed workflow without markers", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [RENAMED_WORKFLOW_PATH]: makeWorkflow("- run: pnpm format"),
          "package.json": PACKAGE_JSON,
        })

        expect(yield* assessFiles(files)).toStrictEqual({ applicable: false })
      })
    )

    it.effect.each<{
      readonly currentState: string
      readonly files: Readonly<Record<string, string>>
      readonly name: string
    }>([
      {
        currentState:
          "Adamantite cannot read the managed block in `.github/workflows/checks.yml`. It has `# ADAMANTITE:START` without `# ADAMANTITE:END` after it.",
        files: {
          [RENAMED_WORKFLOW_PATH]: makeBlockWorkflow("- run: pnpm run check").replace(
            "  # ADAMANTITE:END\n",
            ""
          ),
        },
        name: "a start marker without an end marker",
      },
      {
        currentState:
          "Adamantite cannot read the managed block in `.github/workflows/adamantite.yml`, `.github/workflows/checks.yml`. More than one workflow file has a managed block.",
        files: {
          [RENAMED_WORKFLOW_PATH]: makeBlockWorkflow("- run: pnpm run check"),
          [WORKFLOW_PATH]: makeBlockWorkflow("- run: pnpm run check"),
        },
        name: "a managed block in two workflow files",
      },
      {
        currentState:
          "Adamantite cannot read the managed block in `.github/workflows/checks.yml`. The jobs between the markers do not parse as workflow jobs.",
        files: {
          [RENAMED_WORKFLOW_PATH]: [
            "on: push",
            "jobs:",
            "  # ADAMANTITE:START",
            "  verify: [",
            "  # ADAMANTITE:END",
            "",
          ].join("\n"),
        },
        name: "a managed block that does not parse",
      },
    ])("report $name", ({ currentState, files: workflows }) =>
      Effect.gen(function* () {
        const files = makeFiles({ ...workflows, "package.json": PACKAGE_JSON })

        expect(yield* assessFiles(files)).toMatchObject({
          findings: [{ currentState, id: "malformed-adamantite-workflow" }],
        })
      })
    )

    it.effect("ignore check text that is not a workflow command", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: [
            "# run: pnpm run check",
            "on: push",
            "jobs:",
            "  check-types:",
            "    name: check",
            "    runs-on: ubuntu-latest",
            "    steps:",
            "      - name: pnpm run check",
            "        run: pnpm run format",
          ].join("\n"),
          "package.json": PACKAGE_JSON,
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => github.assess(project)),
          provideAssessment(files)
        )

        expect(result).toMatchObject({
          findings: [
            {
              currentState: expect.stringContaining("do not run the managed `check` script"),
              id: "outdated-adamantite-workflow",
            },
          ],
        })
      })
    )

    it.effect.each([
      { name: "a block step", workflow: makeWorkflow("- run: pnpm run check") },
      {
        name: "a flow step",
        workflow: makeWorkflow("- { name: Check, run: pnpm run check }"),
      },
      {
        name: "a matrix entry",
        workflow: makeMatrixWorkflow({ command: "pnpm run check", name: "check" }),
      },
    ])("accept a package-manager check command in $name", ({ workflow }) =>
      Effect.gen(function* () {
        const files = makeFiles({ [WORKFLOW_PATH]: workflow, "package.json": PACKAGE_JSON })

        expect(
          yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [],
        })
      })
    )

    it.effect("accept a check command in a run block scalar", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow(
            "- run: |2-  ",
            "      pnpm install --frozen-lockfile",
            "      pnpm --filter app run check"
          ),
          "package.json": PACKAGE_JSON,
        })

        expect(
          yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [],
        })
      })
    )

    it.effect("accept a check command after tab-indented lines in a run block scalar", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow(
            "- run: |",
            "    cat > Makefile <<'EOF'",
            "    build:",
            "    \techo build",
            "    EOF",
            "    pnpm run check"
          ),
          "package.json": PACKAGE_JSON,
        })

        expect(
          yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [],
        })
      })
    )

    it.effect("ignore a commented-out Node.js version", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow(
            "- uses: actions/setup-node@v7",
            "  with:",
            '    # node-version: "22"',
            '    node-version-file: ".nvmrc"',
            "- run: pnpm run check"
          ),
          "package.json": PACKAGE_JSON,
        })

        expect(
          yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [],
        })
      })
    )

    it.effect("not require a rule test command even when saved tests remain", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ...RULE_TEST_FILES,
          [WORKFLOW_PATH]: makeWorkflow("- run: pnpm run check"),
          "package.json": PACKAGE_JSON,
        })

        expect(
          yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({ findings: [] })
      })
    )

    it.effect.each([
      {
        name: "a double-quoted run",
        workflow: makeWorkflow("- run: pnpm run check", '- run: "pnpm exec adamantite rule test"'),
      },
      {
        name: "a single-quoted run",
        workflow: makeWorkflow("- run: pnpm run check", "- run: 'pnpm exec adamantite rule test'"),
      },
      {
        name: "a quoted matrix command",
        workflow: makeMatrixWorkflow(
          { command: '"pnpm run check"', name: "check" },
          { command: '"pnpm exec adamantite rule test"', name: "rule test" }
        ),
      },
    ])("accept an optional rule test command in $name", ({ workflow }) =>
      Effect.gen(function* () {
        const files = makeFiles({
          ...RULE_TEST_FILES,
          [WORKFLOW_PATH]: workflow,
          "package.json": PACKAGE_JSON,
        })

        expect(
          yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [],
        })
      })
    )

    it.effect("accept an optional rule test command without managed scripts", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow("- run: pnpm exec adamantite rule test"),
        })

        const before = files.read(WORKFLOW_PATH)

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => github.assess(project)),
          provideAssessment(files)
        )

        expect(result).toMatchObject({ findings: [], warnings: [] })
        expect(files.read(WORKFLOW_PATH)).toBe(before)
      })
    )

    it.effect("accept an optional rule test command in a run block scalar", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ...RULE_TEST_FILES,
          [WORKFLOW_PATH]: makeWorkflow(
            "- run: |",
            "    pnpm run check",
            "    pnpm exec adamantite rule test"
          ),
          "package.json": PACKAGE_JSON,
        })

        expect(
          yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [],
        })
      })
    )

    it.effect("not ask for a rule test command when the project has no rule tests", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ...RULE_FILES,
          [WORKFLOW_PATH]: makeWorkflow(
            "- uses: actions/setup-node@v7",
            "  with:",
            '    node-version: "22"',
            "- run: pnpm run check"
          ),
          "package.json": PACKAGE_JSON,
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => github.assess(project)),
          provideAssessment(files)
        )

        expect(result).toMatchObject({
          findings: [
            {
              currentState:
                "The managed jobs in `.github/workflows/adamantite.yml` contain a hard-coded Node.js version.",
            },
          ],
        })
        expect(yield* stringifyJson(result)).not.toContain("rule test")
      })
    )

    it.effect("read the steps of a job beside a job whose matrix is an expression", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: [
            "on: push",
            "jobs:",
            "  test:",
            "    runs-on: ubuntu-latest",
            "    strategy:",
            `      matrix: \${{ fromJSON(needs.setup.outputs.matrix) }}`,
            "    steps:",
            "      - run: pnpm test",
            "  verify:",
            "    runs-on: ubuntu-latest",
            "    steps:",
            "      - run: pnpm run check",
          ].join("\n"),
          "package.json": PACKAGE_JSON,
        })

        expect(
          yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [],
        })
      })
    )

    it.effect("report a workflow that does not parse as a workflow that runs nothing", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: "jobs:\n  verify:\n    steps: [\n      run: pnpm run check\n",
          "package.json": PACKAGE_JSON,
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => github.assess(project)),
          provideAssessment(files)
        )

        expect(result).toMatchObject({
          findings: [
            {
              currentState:
                "The managed jobs in `.github/workflows/adamantite.yml` do not run the managed `check` script.",
              id: "outdated-adamantite-workflow",
            },
          ],
        })
      })
    )

    it.effect("warn when an off-ideal workflow cannot be regenerated", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow(
            "- uses: actions/setup-node@v7",
            "  with:",
            '    node-version: "22"'
          ),
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => github.assess(project)),
          provideAssessment(files)
        )

        expect(result).toMatchObject({
          applicable: true,
          findings: [],
          warnings: [expect.stringContaining("CI-compatible")],
        })
      })
    )
  })

  describe("create", () => {
    it.effect.each([
      {
        packageManager: "bun",
        steps: [
          { name: "Checkout", uses: "actions/checkout" },
          { name: "Setup Node.js", uses: "actions/setup-node", with: { "node-version": "lts/*" } },
          { name: "Setup Bun", uses: "oven-sh/setup-bun" },
          {
            name: "Cache dependencies",
            uses: "actions/cache",
            with: {
              key: `\${{ runner.os }}-bun-\${{ hashFiles('bun.lock') }}`,
              path: "~/.bun/install/cache\nnode_modules\n",
              "restore-keys": `\${{ runner.os }}-bun-\n`,
            },
          },
          { name: "Install dependencies", run: "bun install --frozen-lockfile" },
        ],
      },
      {
        packageManager: "deno",
        steps: [
          { name: "Checkout", uses: "actions/checkout" },
          { name: "Setup Deno", uses: "denoland/setup-deno" },
          { name: "Install dependencies", run: "deno install --frozen" },
        ],
      },
      {
        packageManager: "npm",
        steps: [
          { name: "Checkout", uses: "actions/checkout" },
          {
            name: "Setup Node.js",
            uses: "actions/setup-node",
            with: { cache: "npm", "node-version": "lts/*" },
          },
          { name: "Install dependencies", run: "npm ci" },
        ],
      },
      {
        packageManager: "pnpm",
        steps: [
          { name: "Checkout", uses: "actions/checkout" },
          { name: "Setup pnpm", uses: "pnpm/action-setup" },
          {
            name: "Setup Node.js",
            uses: "actions/setup-node",
            with: { cache: "pnpm", "node-version": "lts/*" },
          },
          { name: "Install dependencies", run: "pnpm install --frozen-lockfile" },
        ],
      },
      {
        packageManager: "yarn",
        steps: [
          { name: "Checkout", uses: "actions/checkout" },
          {
            name: "Setup Node.js",
            uses: "actions/setup-node",
            with: { cache: "yarn", "node-version": "lts/*" },
          },
          { name: "Install dependencies", run: "yarn install --frozen-lockfile" },
        ],
      },
    ] as const)("set up $packageManager and run its check command", ({ packageManager, steps }) =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, { packageManager, scripts: ["check"] })
          .pipe(provideFallback(files))

        const workflow = readGeneratedWorkflow(files)
        expect({
          include: workflow.strategy.matrix.include,
          // The pin test checks the action versions.
          steps: workflow.steps.map((step) =>
            Struct.evolve(step, { uses: (uses) => uses?.replace(/@.+$/u, "") })
          ),
        }).toStrictEqual({
          include: [
            {
              command:
                packageManager === "deno" ? "deno task check" : `${packageManager} run check`,
              name: "check",
            },
          ],
          steps: [...steps, { name: `Run \${{ matrix.name }}`, run: `\${{ matrix.command }}` }],
        })
      })
    )

    it.effect("put the generated job in the managed block", () =>
      Effect.gen(function* () {
        const workflow = yield* generateWorkflow(["check"])

        expect(readBlock(workflow)).toBeInstanceOf(Block)
        expect(workflow).toContain("\njobs:\n  # ADAMANTITE:START\n  verify:\n")
        expect(workflow.endsWith(`run: \${{ matrix.command }}\n  # ADAMANTITE:END\n`)).toBe(true)
      })
    )

    it.effect("render the fixed workflow settings", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, { packageManager: "pnpm", scripts: ["check"] })
          .pipe(provideFallback(files))

        expect(Yaml.parse(files.read(WORKFLOW_PATH))).toMatchObject({
          concurrency: {
            "cancel-in-progress": true,
            group: `\${{ github.workflow }}-\${{ github.ref }}`,
          },
          jobs: {
            verify: {
              name: `\${{ matrix.name }}`,
              "runs-on": "ubuntu-latest",
              strategy: { "fail-fast": false },
              "timeout-minutes": 10,
            },
          },
          name: "adamantite",
          on: {
            pull_request: { types: ["opened", "synchronize", "reopened"] },
            push: { branches: ["main"] },
          },
          permissions: { contents: "read" },
        })
      })
    )

    // Dependabot updates the actions in this repository's workflows, not in the generated workflow.
    // This test fails the Dependabot PR until the generator pins the same version.
    it.effect("pin the actions this repository also uses at the same version", () =>
      Effect.gen(function* () {
        const generated = new Map<string, string>()

        for (const packageManager of SUPPORTED_PACKAGE_MANAGERS) {
          const files = makeFiles()
          yield* github
            .create(ROOT, { packageManager, scripts: ["check"] })
            .pipe(provideFallback(files))

          for (const [action, ref] of getPinnedActions(files.read(WORKFLOW_PATH))) {
            generated.set(action, ref)
          }
        }

        const reference = getPinnedActions(testWorkflow)

        const shared = EffectArray.sort(
          [...generated.keys()].filter((action) => reference.has(action)),
          Order.String
        )

        expect(shared).toStrictEqual([
          "actions/checkout",
          "actions/setup-node",
          "oven-sh/setup-bun",
          "pnpm/action-setup",
        ])
        expect(
          Object.fromEntries(shared.map((action) => [action, generated.get(action)]))
        ).toStrictEqual(Object.fromEntries(shared.map((action) => [action, reference.get(action)])))
      })
    )

    it.effect("include all CI-compatible scripts as jobs", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "bun",
            scripts: ["check", "fix", "analyze"],
          })
          .pipe(provideFallback(files))

        expect(getMatrixJobs(files)).toStrictEqual([
          { command: "bun run check", name: "check" },
          { command: "bun run analyze", name: "analyze" },
        ])
      })
    )

    it.effect.each(SUPPORTED_PACKAGE_MANAGERS)(
      "accept the workflow that create writes for %s",
      (packageManager) =>
        Effect.gen(function* () {
          const files = makeFiles({
            ".node-version": "24\n",
            "package.json": PACKAGE_JSON_WITH_SCRIPTS,
          })

          yield* github
            .create(ROOT, { packageManager, scripts: ["check", "analyze"] })
            .pipe(provideFallback(files))

          const result = yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files, packageManager)
          )

          expect(result).toStrictEqual({
            applicable: true,
            findings: [],
            packageActions: [],
            warnings: [],
          })
        })
    )

    it.effect.each(SUPPORTED_PACKAGE_MANAGERS)(
      "omit saved rule tests from the workflow for %s",
      (packageManager) =>
        Effect.gen(function* () {
          const files = makeFiles(RULE_TEST_FILES)

          yield* github
            .create(ROOT, { packageManager, scripts: ["check", "analyze"] })
            .pipe(provideFallback(files))

          expect(getMatrixJobs(files).map((entry) => entry.name)).toStrictEqual([
            "check",
            "analyze",
          ])

          if (packageManager === "deno") {
            expect(getSetupNodeInputs(files)).toBeUndefined()
          }
        })
    )

    it.effect("not run the custom rule tests when a rules folder has no tests", () =>
      Effect.gen(function* () {
        const files = makeFiles(RULE_FILES)

        yield* github
          .create(ROOT, { packageManager: "pnpm", scripts: ["check"] })
          .pipe(provideFallback(files))

        expect(getMatrixJobs(files)).toStrictEqual([{ command: "pnpm run check", name: "check" }])
      })
    )

    it.effect("not create a workflow when no CI-compatible scripts are selected", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "bun",
            scripts: ["fix"],
          })
          .pipe(provideFallback(files))

        const exists = yield* github.detect(ROOT).pipe(provideFallback(files))
        expect(exists._tag).toBe("Missing")
      })
    )

    it.effect(
      "render node-version-file for every Node-based workflow when the resolver selects a version file",
      () =>
        Effect.gen(function* () {
          yield* expectNodeVersionFileWorkflow("bun")
          yield* expectNodeVersionFileWorkflow("npm")
          yield* expectNodeVersionFileWorkflow("pnpm")
          yield* expectNodeVersionFileWorkflow("yarn")
        })
    )

    it.effect("not render a Node setup step for deno when the project has no rule tests", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "deno",
            scripts: ["check"],
          })
          .pipe(provideFileResolver(files))

        expect(getSetupNodeInputs(files)).toBeUndefined()
      })
    )
  })

  describe("update", () => {
    it.effect.each([
      {
        name: "an explicit test step and its Node setup",
        packageManager: "deno",
        workflow: makeWorkflow(
          "- uses: actions/setup-node@v7",
          "  with:",
          '    node-version-file: ".node-version"',
          "- run: deno task check",
          "- run: deno run -A npm:adamantite rule test"
        ),
      },
      {
        name: "an explicit test matrix entry",
        packageManager: "pnpm",
        workflow: makeMatrixWorkflow(
          { command: "pnpm run check", name: "check" },
          { command: "pnpm exec adamantite rule test", name: "rule test" }
        ),
      },
      {
        name: "a test step that runs a package script",
        packageManager: "pnpm",
        workflow: makeMatrixWorkflow(
          { command: "pnpm run check", name: "check" },
          { command: "pnpm run test:rules", name: "rule test" }
        ),
      },
      {
        name: "a workflow that Adamantite did not write",
        packageManager: "bun",
        workflow: "name: Old Workflow",
      },
    ] as const)("preserve $name", ({ packageManager, workflow }) =>
      Effect.gen(function* () {
        const files = makeFiles({ ...RULE_TEST_FILES, [WORKFLOW_PATH]: workflow })

        const result = yield* github
          .update(ROOT, { packageManager, scripts: ["check", "analyze"] })
          .pipe(provideFallback(files))

        expect(files.read(WORKFLOW_PATH)).toBe(workflow)
        expect(result).toBe("kept")
      })
    )

    it.effect(
      "rewrite only the managed block of a workflow that the project changed outside it",
      () =>
        Effect.gen(function* () {
          const files = makeFiles({
            [RENAMED_WORKFLOW_PATH]: `${renameWorkflow(yield* generateWorkflow(["check"]))}${PROJECT_JOB}`,
          })

          const result = yield* github
            .update(ROOT, { packageManager: "pnpm", scripts: ["check", "analyze"] })
            .pipe(provideFallback(files))

          expect(result).toBe("updated")
          expect(files.read(RENAMED_WORKFLOW_PATH)).toBe(
            `${renameWorkflow(yield* generateWorkflow(["check", "analyze"]))}${PROJECT_JOB}`
          )
          expect(files.exists(WORKFLOW_PATH)).toBe(false)
        })
    )

    it.effect("add the markers to a workflow that a release before the block generated", () =>
      Effect.gen(function* () {
        const generated = yield* generateWorkflow(["check"])

        const files = makeFiles({
          [WORKFLOW_PATH]: generated
            .replace("  # ADAMANTITE:START\n", "")
            .replace("  # ADAMANTITE:END\n", ""),
        })

        const result = yield* github
          .update(ROOT, { packageManager: "pnpm", scripts: ["check"] })
          .pipe(provideFallback(files))

        expect(result).toBe("updated")
        expect(files.read(WORKFLOW_PATH)).toBe(generated)
      })
    )

    it.effect("keep a workflow whose markers do not make one block", () =>
      Effect.gen(function* () {
        const workflow = (yield* generateWorkflow(["check"])).replace("  # ADAMANTITE:END\n", "")
        const files = makeFiles({ [WORKFLOW_PATH]: workflow })

        const result = yield* github
          .update(ROOT, { packageManager: "pnpm", scripts: ["check", "analyze"] })
          .pipe(provideFallback(files))

        expect(result).toBe("kept")
        expect(files.read(WORKFLOW_PATH)).toBe(workflow)
      })
    )

    it.effect("keep a generated workflow that the project changed", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, { packageManager: "pnpm", scripts: ["check"] })
          .pipe(provideFallback(files))

        const edited = files
          .read(WORKFLOW_PATH)
          .replace("runs-on: ubuntu-latest", "runs-on: macos-latest")

        files.write(WORKFLOW_PATH, edited)

        const result = yield* github
          .update(ROOT, { packageManager: "pnpm", scripts: ["check", "analyze"] })
          .pipe(provideFallback(files))

        expect(files.read(WORKFLOW_PATH)).toBe(edited)
        expect(result).toBe("kept")
      })
    )

    it.effect("rewrite a generated workflow after the Node.js version source changes", () =>
      Effect.gen(function* () {
        const files = makeFiles({ ".nvmrc": "24\n" })

        yield* github
          .create(ROOT, { packageManager: "pnpm", scripts: ["check"] })
          .pipe(provideFallback(files))

        // The project adds a version file after init wrote the workflow with the default.
        const result = yield* github
          .update(ROOT, { packageManager: "pnpm", scripts: ["check"] })
          .pipe(
            Effect.provide([
              files.layer,
              Path.layer,
              makeModuleResolverLayer(ROOT),
              makeResolverLayer(new NodeVersionFile({ path: ".nvmrc" })),
            ])
          )

        expect(result).toBe("updated")
        expect(files.read(WORKFLOW_PATH)).toContain('node-version-file: ".nvmrc"')
      })
    )

    it.effect("rewrite a generated workflow that a checkout gave CRLF line endings", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, { packageManager: "pnpm", scripts: ["check"] })
          .pipe(provideFallback(files))

        // Git with core.autocrlf, or an editor, can change the line endings and the last newline.
        files.write(WORKFLOW_PATH, `${files.read(WORKFLOW_PATH).replaceAll("\n", "\r\n")}\r\n`)

        const result = yield* github
          .update(ROOT, { packageManager: "pnpm", scripts: ["check", "analyze"] })
          .pipe(provideFallback(files))

        expect(result).toBe("updated")
        // The rewrite of the block keeps the line endings of the file.
        expect(files.read(WORKFLOW_PATH)).toBe(
          `${(yield* generateWorkflow(["check", "analyze"])).replaceAll("\n", "\r\n")}\r\n`
        )
      })
    )

    it.effect("keep a Node.js version that the project wrote into the workflow", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, { packageManager: "pnpm", scripts: ["check"] })
          .pipe(provideFallback(files))

        const edited = files
          .read(WORKFLOW_PATH)
          .replace('node-version: "lts/*"', 'node-version: "20"')

        files.write(WORKFLOW_PATH, edited)

        const result = yield* github
          .update(ROOT, { packageManager: "pnpm", scripts: ["check"] })
          .pipe(provideFallback(files))

        expect(files.read(WORKFLOW_PATH)).toBe(edited)
        expect(result).toBe("kept")
      })
    )

    it.effect("rewrite a workflow that Adamantite generated", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, { packageManager: "pnpm", scripts: ["check"] })
          .pipe(provideFallback(files))

        const result = yield* github
          .update(ROOT, { packageManager: "pnpm", scripts: ["check", "analyze"] })
          .pipe(provideFallback(files))

        expect(result).toBe("updated")
        expect(Yaml.parse(files.read(WORKFLOW_PATH))).toMatchObject({
          jobs: {
            verify: {
              strategy: { matrix: { include: [{ name: "check" }, { name: "analyze" }] } },
            },
          },
          name: "adamantite",
        })
      })
    )
  })
})
