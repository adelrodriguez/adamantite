import { describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
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
    Layer.mergeAll(files.layer, Path.layer, makeResolverLayer({ _tag: "Version", value: "lts/*" }))
  )
}

function provideAssessment(files: FileSystemTestContext, packageManager: "deno" | "pnpm" = "pnpm") {
  return Effect.provide(
    Layer.mergeAll(
      files.layer,
      Path.layer,
      Layer.succeed(DependencyInstaller)({
        addDevDependencies: () => Effect.void,
        detectPackageManager: () => Effect.succeed({ name: packageManager }),
      })
    )
  )
}

function getMatrixJobs(workflow: string) {
  return Array.from(workflow.matchAll(/- name: (.+)\n\s+command: (.+)/g), ([, name, command]) => ({
    command,
    name,
  }))
}

function provideFileResolver(files: FileSystemTestContext) {
  return Effect.provide(
    Layer.mergeAll(
      files.layer,
      Path.layer,
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

    const content = files.read(WORKFLOW_PATH)
    expect(content).toContain("Setup Node.js")
    expect(content).toContain('node-version-file: ".node-version"')
    expect(content).not.toContain('node-version: "')
  })
}

describe("github", () => {
  describe("assess", () => {
    const packageJson = { scripts: { check: "adamantite check" } }

    it.effect("report hard-coded Node.js and a missing check command", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: 'node-version: "22"\nrun: pnpm format\n',
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
          warnings: [],
        })
      })
    )

    it.effect("ignore check text that is not a workflow command", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: [
            "# run check in CI",
            "jobs:",
            "  check-types:",
            "    name: check",
            "    steps:",
            "      - run: pnpm run format",
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

    it.effect("accept a package-manager check command", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: "steps:\n  - run: pnpm run check\n",
        })

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
          [WORKFLOW_PATH]: [
            "steps:",
            "  - run: |2-  ",
            "      pnpm install --frozen-lockfile",
            "      pnpm --filter app run check",
          ].join("\n"),
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
          [WORKFLOW_PATH]: [
            "matrix:",
            "  include:",
            "    - name: check",
            "      command: pnpm run check",
            "    - name: format",
            "      command: pnpm run format --check",
          ].join("\n"),
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
          [WORKFLOW_PATH]: [
            "matrix:",
            "  include:",
            "    - name: check",
            "      command: pnpm run check",
            "    - name: monorepo",
            "      command: pnpm run check:monorepo",
          ].join("\n"),
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
          [WORKFLOW_PATH]: [
            "steps:",
            "  - run: |",
            "      pnpm run check",
            "      pnpm exec adamantite monorepo -- -i react",
          ].join("\n"),
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
          [WORKFLOW_PATH]: [
            "steps:",
            "  - run: pnpm run check",
            "  - run: npm run fix:monorepo",
          ].join("\n"),
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
          [WORKFLOW_PATH]: [
            "steps:",
            "  - run: pnpm run check",
            "  - run: pnpm exec adamantite analyze --only monorepo",
          ].join("\n"),
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
          [WORKFLOW_PATH]: [
            "steps:",
            "  - run: |",
            "      npm run check",
            "      npm run format -- --check",
          ].join("\n"),
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
          [WORKFLOW_PATH]: 'node-version: "22"\nrun: pnpm run format --check\n',
        })

        expect(
          yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))
        ).toMatchObject({
          findings: [{ id: "outdated-adamantite-workflow" }, { id: "legacy-format-workflow-step" }],
        })
      })
    )

    it.effect("ignore a format command that does not pass --check", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [WORKFLOW_PATH]: [
            "# pnpm run format --check",
            "steps:",
            "  - run: pnpm run check",
            "  - run: pnpm run format",
          ].join("\n"),
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
          [WORKFLOW_PATH]: "steps:\n  - run: pnpm run check\n",
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
          [WORKFLOW_PATH]: "steps:\n  - run: deno task check\n",
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

    it.effect("accept a rule test command in a run block scalar", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ...RULE_TEST_FILES,
          [WORKFLOW_PATH]: [
            "steps:",
            "  - run: |",
            "      pnpm run check",
            "      pnpm exec adamantite rule test",
          ].join("\n"),
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
          [WORKFLOW_PATH]: 'node-version: "22"\nrun: pnpm run check\n',
        })
        const result = yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))

        expect(result).toMatchObject({
          findings: [{ currentState: "The workflow contains a hard-coded Node.js version." }],
        })
        expect(JSON.stringify(result)).not.toContain("rule test")
      })
    )

    it.effect("warn when an off-ideal workflow cannot be regenerated", () =>
      Effect.gen(function* () {
        const files = makeFiles({ [WORKFLOW_PATH]: 'node-version: "22"\n' })
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
        actions: ["actions/checkout", "actions/setup-node", "oven-sh/setup-bun", "actions/cache"],
        cache: null,
        command: "bun run check",
        install: "bun install --frozen-lockfile",
        packageManager: "bun",
      },
      {
        actions: ["actions/checkout", "actions/setup-node"],
        cache: "npm",
        command: "npm run check",
        install: "npm ci",
        packageManager: "npm",
      },
      {
        actions: ["actions/checkout", "pnpm/action-setup", "actions/setup-node"],
        cache: "pnpm",
        command: "pnpm run check",
        install: "pnpm install --frozen-lockfile",
        packageManager: "pnpm",
      },
      {
        actions: ["actions/checkout", "actions/setup-node"],
        cache: "yarn",
        command: "yarn run check",
        install: "yarn install --frozen-lockfile",
        packageManager: "yarn",
      },
      {
        actions: ["actions/checkout", "denoland/setup-deno"],
        cache: null,
        command: "deno task check",
        install: "deno install --frozen",
        packageManager: "deno",
      },
    ] as const)("set up $packageManager and run its check command", (expected) =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, { packageManager: expected.packageManager, scripts: ["check"] })
          .pipe(provideFallback(files))

        const workflow = files.read(WORKFLOW_PATH)
        expect({
          actions: Array.from(workflow.matchAll(/uses: ([^@\s]+)@/g), ([, action]) => action),
          cache: /cache: "(\w+)"/.exec(workflow)?.[1] ?? null,
          install: /- name: Install dependencies\n\s+run: (.+)/.exec(workflow)?.[1],
          jobs: getMatrixJobs(workflow),
          run: /- name: Run .+\n\s+run: (.+)/.exec(workflow)?.[1],
        }).toStrictEqual({
          actions: expected.actions,
          cache: expected.cache,
          install: expected.install,
          jobs: [{ command: expected.command, name: "check" }],
          run: `\${{ matrix.command }}`,
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

        expect(getMatrixJobs(files.read(WORKFLOW_PATH))).toStrictEqual([
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

          expect(getMatrixJobs(files.read(WORKFLOW_PATH)).slice(2)).toStrictEqual([
            { command, name: "rule test" },
          ])
        })
    )

    it.effect("not run the custom rule tests when a rules folder has no tests", () =>
      Effect.gen(function* () {
        const files = makeFiles(RULE_FILES)

        yield* github
          .create(ROOT, { packageManager: "pnpm", scripts: ["check"] })
          .pipe(provideFallback(files))

        expect(getMatrixJobs(files.read(WORKFLOW_PATH))).toStrictEqual([
          { command: "pnpm run check", name: "check" },
        ])
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

        const content = files.read(WORKFLOW_PATH)
        expect(content).toContain('node-version-file: ".node-version"')
        expect(content.indexOf("Setup Node.js")).toBeLessThan(content.indexOf("Setup Deno"))
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

        const content = files.read(WORKFLOW_PATH)
        expect(content).not.toContain("Setup Node.js")
        expect(content).not.toContain("node-version")
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

        const content = files.read(WORKFLOW_PATH)
        expect(content).toContain("name: adamantite")
        expect(content).toContain("name: check")
        expect(content).toContain("verify:")
        expect(content).not.toContain("Old Workflow")
      })
    )
  })
})
