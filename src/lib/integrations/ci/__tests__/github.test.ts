// The "keep shared action versions aligned" test compares generated output
// against this repository's committed `.github/workflows/ci.yml`, so that one
// reference read uses the real filesystem.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import github from "#lib/integrations/ci/github.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import {
  type NodeVersionSource,
  NodeVersionResolver,
} from "#lib/workspace/node-version-resolver.ts"

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

function provideFileResolver(files: FileSystemTestContext) {
  return Effect.provide(
    Layer.mergeAll(
      files.layer,
      Path.layer,
      makeResolverLayer({ _tag: "File", path: ".node-version" })
    )
  )
}

function provideLiveResolver(files: FileSystemTestContext) {
  const base = Layer.mergeAll(files.layer, Path.layer)

  return Effect.provide(Layer.mergeAll(base, NodeVersionResolver.layer.pipe(Layer.provide(base))))
}

function getActionReference(content: string, action: string): string | undefined {
  return content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(`uses: ${action}@`))
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
        expect(yield* github.assess(ROOT, packageJson).pipe(provideAssessment(files))).toEqual({
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

  describe("detect", () => {
    it.effect("detect when the workflow does not exist", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const exists = yield* github.detect(ROOT).pipe(provideFallback(files))

        expect(exists).toBe(false)
      })
    )
  })

  describe("create", () => {
    it.effect("create a GitHub Actions workflow with the expected bun structure", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "bun",
            scripts: ["check", "format"],
          })
          .pipe(provideFallback(files))

        const exists = yield* github.detect(ROOT).pipe(provideFallback(files))
        expect(exists).toBe(true)

        const content = files.read(WORKFLOW_PATH)
        expect(content).toContain("name: adamantite")
        expect(content).toContain("verify:")
        expect(content).toContain("strategy:")
        expect(content).toContain("matrix:")
        expect(content).toContain("include:")
        expect(content).toContain("name: check")
        expect(content).toContain("command: bun run check")
        expect(content).toContain("Setup Node.js")
        expect(content).toContain("actions/setup-node@v7")
        expect(content).toContain('node-version: "lts/*"')
        expect(content).toContain("Setup Bun")
        expect(content).toContain("Cache dependencies")
        expect(content).toContain("actions/cache@v6")
        expect(content).toContain("~/.bun/install/cache")
        expect(content).toContain("bun install --frozen-lockfile")
      })
    )

    it.effect("keep shared action versions aligned with this repository's CI workflow", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "bun",
            scripts: ["check"],
          })
          .pipe(provideFallback(files))

        const generatedWorkflow = files.read(WORKFLOW_PATH)
        const referenceWorkflow = readFileSync(
          join(process.cwd(), ".github/workflows/ci.yml"),
          "utf8"
        )

        for (const action of ["actions/checkout", "actions/setup-node", "oven-sh/setup-bun"]) {
          expect(getActionReference(generatedWorkflow, action)).toBe(
            getActionReference(referenceWorkflow, action)
          )
        }
      })
    )

    it.effect("generate the correct workflow for npm", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "npm",
            scripts: ["check"],
          })
          .pipe(provideFallback(files))

        const content = files.read(WORKFLOW_PATH)
        expect(content).toContain("Setup Node.js")
        expect(content).toContain("actions/setup-node@v7")
        expect(content).toContain('cache: "npm"')
        expect(content).toContain("npm ci")
        expect(content).toContain("command: npm run check")
      })
    )

    it.effect("generate the correct workflow for pnpm", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "pnpm",
            scripts: ["check"],
          })
          .pipe(provideFallback(files))

        const content = files.read(WORKFLOW_PATH)
        expect(content).toContain("Setup pnpm")
        expect(content).toContain("pnpm/action-setup@v4")
        expect(content).toContain("actions/setup-node@v7")
        expect(content).toContain('cache: "pnpm"')
        expect(content).toContain("pnpm install --frozen-lockfile")
        expect(content).toContain("command: pnpm run check")
      })
    )

    it.effect("generate the correct workflow for yarn", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "yarn",
            scripts: ["check"],
          })
          .pipe(provideFallback(files))

        const content = files.read(WORKFLOW_PATH)
        expect(content).toContain("Setup Node.js")
        expect(content).toContain("actions/setup-node@v7")
        expect(content).toContain('cache: "yarn"')
        expect(content).toContain("yarn install --frozen-lockfile")
        expect(content).toContain("command: yarn run check")
      })
    )

    it.effect("generate the correct workflow for deno", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "deno",
            scripts: ["check"],
          })
          .pipe(provideFallback(files))

        const content = files.read(WORKFLOW_PATH)
        expect(content).toContain("Setup Deno")
        expect(content).toContain("denoland/setup-deno@v2")
        expect(content).toContain("deno install --frozen")
        expect(content).toContain("deno task check")
      })
    )

    it.effect("include all CI-compatible scripts as jobs", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "bun",
            scripts: ["check", "format", "check:monorepo"],
          })
          .pipe(provideFallback(files))

        const content = files.read(WORKFLOW_PATH)
        expect(content).toContain("name: check")
        expect(content).toContain("name: format")
        expect(content).toContain("name: monorepo")
        expect(content).toContain("command:")
        expect(content).toContain("format")
        expect(content).toContain("--check")
      })
    )

    it.effect("not create a workflow when no CI-compatible scripts are selected", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "bun",
            scripts: ["fix", "fix:monorepo"],
          })
          .pipe(provideFallback(files))

        const exists = yield* github.detect(ROOT).pipe(provideFallback(files))
        expect(exists).toBe(false)
      })
    )

    it.effect("include concurrency settings", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "bun",
            scripts: ["check"],
          })
          .pipe(provideFallback(files))

        const content = files.read(WORKFLOW_PATH)
        expect(content).toContain("permissions:")
        expect(content).toContain("contents: read")
        expect(content).toContain("concurrency:")
        expect(content).toContain("cancel-in-progress: true")
      })
    )

    it.effect(
      "render node-version-file for every Node-based workflow when the resolver selects a version file",
      () =>
        Effect.gen(function* () {
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

    it.effect("resolve a target project's .node-version with the live resolver", () =>
      Effect.gen(function* () {
        const files = makeFiles({ ".node-version": "22.19.0\n" })

        yield* github
          .create(ROOT, {
            packageManager: "npm",
            scripts: ["check"],
          })
          .pipe(provideLiveResolver(files))

        const content = files.read(WORKFLOW_PATH)
        expect(content).toContain('node-version-file: ".node-version"')
      })
    )

    it.effect("fall back to lts/* with the live resolver when no declaration exists", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* github
          .create(ROOT, {
            packageManager: "npm",
            scripts: ["check"],
          })
          .pipe(provideLiveResolver(files))

        const content = files.read(WORKFLOW_PATH)
        expect(content).toContain('node-version: "lts/*"')
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

    it.effect("render the resolved Node.js source when updating", () =>
      Effect.gen(function* () {
        const files = makeFiles({ [WORKFLOW_PATH]: 'node-version: "26"' })

        yield* github
          .update(ROOT, {
            packageManager: "bun",
            scripts: ["check"],
          })
          .pipe(provideFileResolver(files))

        const content = files.read(WORKFLOW_PATH)
        expect(content).toContain('node-version-file: ".node-version"')
        expect(content).not.toContain('node-version: "26"')
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
