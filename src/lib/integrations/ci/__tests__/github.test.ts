import { describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
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

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
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

function provideAssessment(files: FileSystemTestContext) {
  return Effect.provide(
    Layer.mergeAll(
      files.layer,
      Path.layer,
      Layer.succeed(DependencyInstaller)({
        addDevDependencies: () => Effect.void,
        detectPackageManager: () => Effect.succeed({ name: "pnpm" }),
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
              currentState: expect.stringContaining("hard-coded"),
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

    it.effect("not render a Node setup step for deno regardless of the resolved source", () =>
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

    it.effect("return FailedToCreateDirectory when the workflow directory cannot be created", () =>
      Effect.gen(function* () {
        const files = makeFiles()
        files.makeReadOnly(".github")

        const result = yield* Effect.result(
          github
            .create(ROOT, {
              packageManager: "bun",
              scripts: ["check"],
            })
            .pipe(provideFallback(files))
        )

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToCreateDirectory" })
        }
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

    it.effect("return FailedToWriteFile when writing the workflow fails", () =>
      Effect.gen(function* () {
        const files = makeFiles({ [WORKFLOW_PATH]: "name: Old" })
        files.makeReadOnly(WORKFLOW_PATH)

        const result = yield* Effect.result(
          github
            .update(ROOT, {
              packageManager: "bun",
              scripts: ["check"],
            })
            .pipe(provideFallback(files))
        )

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
        }
      })
    )
  })
})
