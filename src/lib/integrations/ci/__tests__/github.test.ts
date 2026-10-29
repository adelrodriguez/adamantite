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
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import {
  type NodeVersionSource,
  NodeVersionResolver,
} from "#lib/workspace/node-version-resolver.ts"
import testWorkflow from "../../../../../.github/workflows/test.yml?raw"

const ROOT = "/project"

const WORKFLOW_PATH = ".github/workflows/adamantite.yml"

// A rules folder that `custom()` loads, with one rule and no test.
const RULE_FILES = {
  ".adamantite/rules/no-a.ts": "export default {}\n",
  "oxlint.config.ts": [
    'import custom from "adamantite/lint/custom"',
    'import { defineConfig } from "oxlint"',
    "",
    "export default defineConfig({ extends: [custom()] })",
    "",
  ].join("\n"),
}

const RULE_TEST_FILES = { ...RULE_FILES, ".adamantite/rules/tests/no-a.ts": "// test\n" }

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
  return Effect.provide(
    Layer.mergeAll(
      files.layer,
      Path.layer,
      makeModuleResolverLayer(ROOT),
      makeResolverLayer({ _tag: "Version", value: "lts/*" })
    )
  )
}

function provideAssessment(files: FileSystemTestContext, packageManager: "deno" | "pnpm" = "pnpm") {
  return Effect.provide(
    Layer.mergeAll(
      files.layer,
      Path.layer,
      makeModuleResolverLayer(ROOT),
      Layer.succeed(DependencyInstaller)({
        addDevDependencies: () => Effect.void,
        detectPackageManager: () => Effect.succeed({ name: packageManager }),
      })
    )
  )
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
  return Effect.provide(
    Layer.mergeAll(
      files.layer,
      Path.layer,
      makeModuleResolverLayer(ROOT),
      makeResolverLayer({ _tag: "File", path: ".node-version" })
    )
  )
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
        const result = yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))

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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
        const result = yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))

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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
        ).toMatchObject({
          findings: [],
        })
      })
    )

    it.effect("report a missing rule test command when the project has rule tests", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ...RULE_TEST_FILES,
          [WORKFLOW_PATH]: makeWorkflow("- run: pnpm run check"),
        })
        const result = yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              currentState:
                "The workflow does not run `adamantite rule test`, and the project has custom rule tests.",
              goal: expect.arrayContaining([
                "Make the workflow run `adamantite rule test`, so that CI runs the custom rule tests.",
              ]),
              id: "outdated-adamantite-workflow",
              notes: expect.arrayContaining([
                "With `pnpm`, run the custom rule tests with `pnpm exec adamantite rule test`.",
              ]),
            },
          ],
        })
      })
    )

    it.effect("tell a Deno project that the rule test job needs a Node.js setup step", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ...RULE_TEST_FILES,
          [WORKFLOW_PATH]: makeWorkflow("- run: deno task check"),
        })
        const result = yield* github
          .assess(ROOT, packageJson)
          .pipe(provideAssessment(files, "deno"))

        expect(result).toMatchObject({
          findings: [
            {
              id: "outdated-adamantite-workflow",
              notes: expect.arrayContaining([
                "`adamantite rule test` runs the tests with Node.js 22.18 or later, so the Deno workflow also needs an `actions/setup-node` step before the tests run.",
              ]),
            },
          ],
        })
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
    ])("accept a rule test command in $name", ({ workflow }) =>
      Effect.gen(function* () {
        const files = makeFiles({ ...RULE_TEST_FILES, [WORKFLOW_PATH]: workflow })

        expect(
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
        ).toMatchObject({
          findings: [],
        })
      })
    )

    it.effect("report a missing rule test command when no managed script runs in CI", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ...RULE_TEST_FILES,
          [WORKFLOW_PATH]: makeWorkflow("- run: pnpm install"),
        })
        const result = yield* github
          .assess(ROOT, { name: "app", version: "1.0.0" })
          .pipe(provideAssessment(files))

        expect(result).toMatchObject({
          findings: [
            {
              currentState:
                "The workflow does not run `adamantite rule test`, and the project has custom rule tests.",
              // The project has no managed `check` script, so the finding does not ask for it.
              goal: [
                "Make the workflow run `adamantite rule test`, so that CI runs the custom rule tests.",
                "Use the project's Node.js version declaration instead of a hard-coded version.",
              ],
              id: "outdated-adamantite-workflow",
            },
          ],
          warnings: [],
        })
      })
    )

    it.effect("accept a rule test command in a run block scalar", () =>
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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
        const result = yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))

        expect(result).toMatchObject({
          findings: [{ currentState: "The workflow contains a hard-coded Node.js version." }],
        })
        expect(JSON.stringify(result)).not.toContain("rule test")
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
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
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
        const result = yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))

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
        const result = yield* github.assess(ROOT, {}).pipe(provideAssessment(files))

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

    it.effect.each([
      { command: "bunx adamantite rule test", packageManager: "bun" },
      { command: "deno run -A npm:adamantite rule test", packageManager: "deno" },
      { command: "npx adamantite rule test", packageManager: "npm" },
      { command: "pnpm exec adamantite rule test", packageManager: "pnpm" },
      { command: "yarn adamantite rule test", packageManager: "yarn" },
    ] as const)(
      "run the custom rule tests with $packageManager when the project has rule tests",
      ({ command, packageManager }) =>
        Effect.gen(function* () {
          const files = makeFiles(RULE_TEST_FILES)

          yield* github
            .create(ROOT, { packageManager, scripts: ["check", "analyze"] })
            .pipe(provideFallback(files))

          expect(getMatrixJobs(files).slice(2)).toStrictEqual([{ command, name: "rule test" }])
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

    it.effect("set up Node.js for deno when the project has rule tests", () =>
      Effect.gen(function* () {
        const files = makeFiles(RULE_TEST_FILES)

        yield* github
          .create(ROOT, { packageManager: "deno", scripts: ["check"] })
          .pipe(provideFileResolver(files))

        expect(readGeneratedWorkflow(files).steps.map((step) => step.name)).toStrictEqual([
          "Checkout",
          "Setup Node.js",
          "Setup Deno",
          "Install dependencies",
          `Run \${{ matrix.name }}`,
        ])
        expect(getSetupNodeInputs(files)).toStrictEqual({ "node-version-file": ".node-version" })
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
