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
import github from "#lib/integrations/ci/github.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import {
  NodeVersion,
  NodeVersionFile,
  NodeVersionResolver,
  type NodeVersionSource,
} from "#lib/workspace/node-version-resolver.ts"
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

function provideAssessment(files: FileSystemTestContext, packageManager: "deno" | "pnpm" = "pnpm") {
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
    const packageJson = { scripts: { check: "adamantite check" } }

    it.effect("report hard-coded Node.js and a missing check command", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow(
            "- uses: actions/setup-node@v7",
            "  with:",
            '    node-version: "22"',
            "- run: pnpm format"
          ),
        })

        const result = yield* readProject(ROOT, packageJson).pipe(
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
        const files = makeFiles()
        expect(
          yield* readProject(ROOT, packageJson).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toStrictEqual({
          applicable: false,
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
        })

        const result = yield* readProject(ROOT, packageJson).pipe(
          Effect.flatMap((project) => github.assess(project)),
          provideAssessment(files)
        )

        expect(result).toMatchObject({
          findings: [
            {
              currentState: expect.stringContaining("does not run the managed `check` script"),
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
        const files = makeFiles({ [WORKFLOW_PATH]: workflow })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
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
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
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
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [],
        })
      })
    )

    it.effect("report a legacy format step in a generated matrix entry", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeMatrixWorkflow(
            { command: "pnpm run check", name: "check" },
            { command: "pnpm run format --check", name: "format" }
          ),
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          applicable: true,
          findings: [{ id: "legacy-format-workflow-step" }],
        })
      })
    )

    it.effect("report a legacy monorepo step in a generated matrix entry", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeMatrixWorkflow(
            { command: "pnpm run check", name: "check" },
            { command: "pnpm run check:monorepo", name: "monorepo" }
          ),
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          applicable: true,
          findings: [{ id: "legacy-monorepo-workflow-step" }],
        })
      })
    )

    it.effect("report a legacy step that runs adamantite monorepo directly", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow(
            "- run: |",
            "    pnpm run check",
            "    pnpm exec adamantite monorepo -- -i react"
          ),
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [{ id: "legacy-monorepo-workflow-step" }],
        })
      })
    )

    it.effect("report a legacy step that runs the fix:monorepo script", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow("- run: pnpm run check", "- run: npm run fix:monorepo"),
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [{ id: "legacy-monorepo-workflow-step" }],
        })
      })
    )

    it.effect("not report a monorepo step for the analyze command", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow(
            "- run: pnpm run check",
            "- run: pnpm exec adamantite analyze --only monorepo"
          ),
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [],
        })
      })
    )

    it.effect("report a legacy format step that passes --check through npm", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow(
            "- run: |",
            "    npm run check",
            "    npm run format -- --check"
          ),
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [{ id: "legacy-format-workflow-step" }],
        })
      })
    )

    it.effect("report a legacy format step together with an outdated workflow", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow(
            "- uses: actions/setup-node@v7",
            "  with:",
            '    node-version: "22"',
            "- run: pnpm run format --check"
          ),
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
            Effect.flatMap((project) => github.assess(project)),
            provideAssessment(files)
          )
        ).toMatchObject({
          findings: [{ id: "outdated-adamantite-workflow" }, { id: "legacy-format-workflow-step" }],
        })
      })
    )

    it.effect("ignore a format command that does not pass --check, and commented-out lines", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: makeWorkflow(
            "# - run: pnpm run format --check",
            "- uses: actions/setup-node@v7",
            "  with:",
            '    # node-version: "22"',
            '    node-version-file: ".nvmrc"',
            "- run: pnpm run check",
            "- run: pnpm run format"
          ),
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
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
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
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
        const files = makeFiles({ ...RULE_TEST_FILES, [WORKFLOW_PATH]: workflow })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
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

        const result = yield* readProject(ROOT, { name: "app", version: "1.0.0" }).pipe(
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
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
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
        })

        const result = yield* readProject(ROOT, packageJson).pipe(
          Effect.flatMap((project) => github.assess(project)),
          provideAssessment(files)
        )

        expect(result).toMatchObject({
          findings: [{ currentState: "The workflow contains a hard-coded Node.js version." }],
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
        })

        expect(
          yield* readProject(ROOT, packageJson).pipe(
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
        })

        const result = yield* readProject(ROOT, packageJson).pipe(
          Effect.flatMap((project) => github.assess(project)),
          provideAssessment(files)
        )

        expect(result).toMatchObject({
          findings: [
            {
              currentState: "The workflow does not run the managed `check` script.",
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

        const result = yield* readProject(ROOT, {}).pipe(
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

        for (const packageManager of ["bun", "deno", "npm", "pnpm", "yarn"] as const) {
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

    it.effect.each(["bun", "deno", "npm", "pnpm", "yarn"] as const)(
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
        expect(exists).toBe(false)
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
    ] as const)("preserve $name", ({ packageManager, workflow }) =>
      Effect.gen(function* () {
        const files = makeFiles({ ...RULE_TEST_FILES, [WORKFLOW_PATH]: workflow })

        yield* github
          .update(ROOT, { packageManager, scripts: ["check", "analyze"] })
          .pipe(provideFallback(files))

        expect(files.read(WORKFLOW_PATH)).toBe(workflow)
      })
    )

    it.effect("update an existing workflow", () =>
      Effect.gen(function* () {
        const files = makeFiles({ [WORKFLOW_PATH]: "name: Old Workflow" })

        yield* github
          .update(ROOT, {
            packageManager: "bun",
            scripts: ["check"],
          })
          .pipe(provideFallback(files))

        expect(Yaml.parse(files.read(WORKFLOW_PATH))).toMatchObject({
          jobs: { verify: { strategy: { matrix: { include: [{ name: "check" }] } } } },
          name: "adamantite",
        })
      })
    )
  })
})
