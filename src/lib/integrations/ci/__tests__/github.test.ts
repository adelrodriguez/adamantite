import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, test } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import { runResult } from "#__tests__/helpers.ts"
import github from "#lib/integrations/ci/github.ts"
import {
  type NodeVersionSource,
  NodeVersionResolver,
} from "#lib/workspace/node-version-resolver.ts"

function makeResolverLayer(source: NodeVersionSource) {
  return Layer.succeed(NodeVersionResolver)({
    resolve: () => Effect.succeed(source),
  })
}

const fallbackTestLayer = Layer.mergeAll(
  NodeServices.layer,
  makeResolverLayer({ _tag: "Version", value: "lts/*" })
)

const fileTestLayer = Layer.mergeAll(
  NodeServices.layer,
  makeResolverLayer({ _tag: "File", path: ".node-version" })
)

const liveResolverLayer = Layer.mergeAll(
  NodeServices.layer,
  NodeVersionResolver.layer.pipe(Layer.provide(NodeServices.layer))
)

function getActionReference(content: string, action: string): string | undefined {
  return content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(`uses: ${action}@`))
}

describe("github", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-github-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("detect", () => {
    test("detect when the workflow does not exist", async () => {
      const exists = await github
        .detect(tempDir)
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)

      expect(exists).toBe(false)
    })
  })

  describe("create", () => {
    test("create a GitHub Actions workflow with the expected bun structure", async () => {
      await github
        .create(tempDir, {
          packageManager: "bun",
          scripts: ["check", "format"],
        })
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)

      const exists = await github
        .detect(tempDir)
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)
      expect(exists).toBe(true)

      const content = await testFile(".github/workflows/adamantite.yml").text()
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

    test("keep shared action versions aligned with this repository's CI workflow", async () => {
      await github
        .create(tempDir, {
          packageManager: "bun",
          scripts: ["check"],
        })
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)

      const generatedWorkflow = await testFile(".github/workflows/adamantite.yml").text()
      const referenceWorkflow = await testFile(join(originalCwd, ".github/workflows/ci.yml")).text()

      for (const action of ["actions/checkout", "actions/setup-node", "oven-sh/setup-bun"]) {
        expect(getActionReference(generatedWorkflow, action)).toBe(
          getActionReference(referenceWorkflow, action)
        )
      }
    })

    test("generate the correct workflow for npm", async () => {
      await github
        .create(tempDir, {
          packageManager: "npm",
          scripts: ["check"],
        })
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)

      const content = await testFile(".github/workflows/adamantite.yml").text()
      expect(content).toContain("Setup Node.js")
      expect(content).toContain("actions/setup-node@v7")
      expect(content).toContain('cache: "npm"')
      expect(content).toContain("npm ci")
      expect(content).toContain("command: npm run check")
    })

    test("generate the correct workflow for pnpm", async () => {
      await github
        .create(tempDir, {
          packageManager: "pnpm",
          scripts: ["check"],
        })
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)

      const content = await testFile(".github/workflows/adamantite.yml").text()
      expect(content).toContain("Setup pnpm")
      expect(content).toContain("pnpm/action-setup@v4")
      expect(content).toContain("actions/setup-node@v7")
      expect(content).toContain('cache: "pnpm"')
      expect(content).toContain("pnpm install --frozen-lockfile")
      expect(content).toContain("command: pnpm run check")
    })

    test("generate the correct workflow for yarn", async () => {
      await github
        .create(tempDir, {
          packageManager: "yarn",
          scripts: ["check"],
        })
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)

      const content = await testFile(".github/workflows/adamantite.yml").text()
      expect(content).toContain("Setup Node.js")
      expect(content).toContain("actions/setup-node@v7")
      expect(content).toContain('cache: "yarn"')
      expect(content).toContain("yarn install --frozen-lockfile")
      expect(content).toContain("command: yarn run check")
    })

    test("generate the correct workflow for deno", async () => {
      await github
        .create(tempDir, {
          packageManager: "deno",
          scripts: ["check"],
        })
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)

      const content = await testFile(".github/workflows/adamantite.yml").text()
      expect(content).toContain("Setup Deno")
      expect(content).toContain("denoland/setup-deno@v2")
      expect(content).toContain("deno install --frozen")
      expect(content).toContain("deno task check")
    })

    test("include all CI-compatible scripts as jobs", async () => {
      await github
        .create(tempDir, {
          packageManager: "bun",
          scripts: ["check", "format", "check:monorepo"],
        })
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)

      const content = await testFile(".github/workflows/adamantite.yml").text()
      expect(content).toContain("name: check")
      expect(content).toContain("name: format")
      expect(content).toContain("name: monorepo")
      expect(content).toContain("command:")
      expect(content).toContain("format")
      expect(content).toContain("--check")
    })

    test("not create a workflow when no CI-compatible scripts are selected", async () => {
      await github
        .create(tempDir, {
          packageManager: "bun",
          scripts: ["fix", "fix:monorepo"],
        })
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)

      const exists = await github
        .detect(tempDir)
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)
      expect(exists).toBe(false)
    })

    test("include concurrency settings", async () => {
      await github
        .create(tempDir, {
          packageManager: "bun",
          scripts: ["check"],
        })
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)

      const content = await testFile(".github/workflows/adamantite.yml").text()
      expect(content).toContain("permissions:")
      expect(content).toContain("contents: read")
      expect(content).toContain("concurrency:")
      expect(content).toContain("cancel-in-progress: true")
    })

    test("render node-version-file for every Node-based workflow when the resolver selects a version file", async () => {
      async function expectNodeVersionFileWorkflow(
        packageManager: "bun" | "npm" | "pnpm" | "yarn"
      ) {
        await github
          .create(tempDir, {
            packageManager,
            scripts: ["check"],
          })
          .pipe(Effect.provide(fileTestLayer), Effect.runPromise)

        const content = await testFile(".github/workflows/adamantite.yml").text()
        expect(content).toContain("Setup Node.js")
        expect(content).toContain('node-version-file: ".node-version"')
        expect(content).not.toContain('node-version: "')
      }

      await expectNodeVersionFileWorkflow("bun")
      await expectNodeVersionFileWorkflow("npm")
      await expectNodeVersionFileWorkflow("pnpm")
      await expectNodeVersionFileWorkflow("yarn")
    })

    test("not render a Node setup step for deno regardless of the resolved source", async () => {
      await github
        .create(tempDir, {
          packageManager: "deno",
          scripts: ["check"],
        })
        .pipe(Effect.provide(fileTestLayer), Effect.runPromise)

      const content = await testFile(".github/workflows/adamantite.yml").text()
      expect(content).not.toContain("Setup Node.js")
      expect(content).not.toContain("node-version")
    })

    test("resolve a target project's .node-version with the live resolver", async () => {
      await writeFile(join(tempDir, ".node-version"), "22.19.0\n")

      await github
        .create(tempDir, {
          packageManager: "npm",
          scripts: ["check"],
        })
        .pipe(Effect.provide(liveResolverLayer), Effect.runPromise)

      const content = await testFile(".github/workflows/adamantite.yml").text()
      expect(content).toContain('node-version-file: ".node-version"')
    })

    test("fall back to lts/* with the live resolver when no declaration exists", async () => {
      await github
        .create(tempDir, {
          packageManager: "npm",
          scripts: ["check"],
        })
        .pipe(Effect.provide(liveResolverLayer), Effect.runPromise)

      const content = await testFile(".github/workflows/adamantite.yml").text()
      expect(content).toContain('node-version: "lts/*"')
    })

    test("return FailedToCreateDirectory when the workflow directory cannot be created", async () => {
      writeFileSync(".github", "not a directory")

      const result = await runResult(
        github.create(tempDir, {
          packageManager: "bun",
          scripts: ["check"],
        }),
        fallbackTestLayer
      )

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToCreateDirectory" })
      }
    })
  })

  describe("update", () => {
    test("update an existing workflow", async () => {
      mkdirSync(".github/workflows", { recursive: true })
      await writeFile(".github/workflows/adamantite.yml", "name: Old Workflow")

      await github
        .update(tempDir, {
          packageManager: "bun",
          scripts: ["check"],
        })
        .pipe(Effect.provide(fallbackTestLayer), Effect.runPromise)

      const content = await testFile(".github/workflows/adamantite.yml").text()
      expect(content).toContain("name: adamantite")
      expect(content).toContain("name: check")
      expect(content).toContain("verify:")
      expect(content).not.toContain("Old Workflow")
    })

    test("render the resolved Node.js source when updating", async () => {
      mkdirSync(".github/workflows", { recursive: true })
      await writeFile(".github/workflows/adamantite.yml", 'node-version: "26"')

      await github
        .update(tempDir, {
          packageManager: "bun",
          scripts: ["check"],
        })
        .pipe(Effect.provide(fileTestLayer), Effect.runPromise)

      const content = await testFile(".github/workflows/adamantite.yml").text()
      expect(content).toContain('node-version-file: ".node-version"')
      expect(content).not.toContain('node-version: "26"')
    })

    test("return FailedToWriteFile when writing the workflow fails", async () => {
      mkdirSync(".github/workflows", { recursive: true })
      writeFileSync(".github/workflows/adamantite.yml", "name: Old")
      chmodSync(".github/workflows/adamantite.yml", 0o444)

      const result = await runResult(
        github.update(tempDir, {
          packageManager: "bun",
          scripts: ["check"],
        }),
        fallbackTestLayer
      )

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
      }
    })
  })
})
