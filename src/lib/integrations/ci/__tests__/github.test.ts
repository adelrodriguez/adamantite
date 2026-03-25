import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import { isLeft, runEither } from "#__tests__/helpers.ts"
import github from "#lib/integrations/ci/github.ts"

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

  describe("exists", () => {
    test("detect when the workflow does not exist", async () => {
      const exists = await github
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

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
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const exists = await github
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(exists).toBe(true)

      const content = await Bun.file(".github/workflows/adamantite.yml").text()
      expect(content).toContain("name: adamantite")
      expect(content).toContain("verify:")
      expect(content).toContain("strategy:")
      expect(content).toContain("matrix:")
      expect(content).toContain("include:")
      expect(content).toContain("name: check")
      expect(content).toContain("command: bun run check")
      expect(content).toContain("Setup Node.js")
      expect(content).toContain("actions/setup-node@v6")
      expect(content).toContain('node-version: "22"')
      expect(content).toContain("Setup Bun")
      expect(content).toContain("Cache dependencies")
      expect(content).toContain("actions/cache@v4")
      expect(content).toContain("~/.bun/install/cache")
      expect(content).toContain("bun install --frozen-lockfile")
    })

    test("generate the correct workflow for npm", async () => {
      await github
        .create(tempDir, {
          packageManager: "npm",
          scripts: ["check"],
        })
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(".github/workflows/adamantite.yml").text()
      expect(content).toContain("Setup Node.js")
      expect(content).toContain("actions/setup-node@v6")
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
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(".github/workflows/adamantite.yml").text()
      expect(content).toContain("Setup pnpm")
      expect(content).toContain("pnpm/action-setup@v4")
      expect(content).toContain("actions/setup-node@v6")
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
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(".github/workflows/adamantite.yml").text()
      expect(content).toContain("Setup Node.js")
      expect(content).toContain("actions/setup-node@v6")
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
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(".github/workflows/adamantite.yml").text()
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
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(".github/workflows/adamantite.yml").text()
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
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const exists = await github
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(exists).toBe(false)
    })

    test("include concurrency settings", async () => {
      await github
        .create(tempDir, {
          packageManager: "bun",
          scripts: ["check"],
        })
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(".github/workflows/adamantite.yml").text()
      expect(content).toContain("permissions:")
      expect(content).toContain("contents: read")
      expect(content).toContain("concurrency:")
      expect(content).toContain("cancel-in-progress: true")
    })

    test("return FailedToCreateDirectory when the workflow directory cannot be created", async () => {
      writeFileSync(".github", "not a directory")

      const result = await runEither(
        github.create(tempDir, {
          packageManager: "bun",
          scripts: ["check"],
        })
      )

      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToCreateDirectory" })
      }
    })
  })

  describe("update", () => {
    test("update an existing workflow", async () => {
      mkdirSync(".github/workflows", { recursive: true })
      await Bun.write(".github/workflows/adamantite.yml", "name: Old Workflow")

      await github
        .update(tempDir, {
          packageManager: "bun",
          scripts: ["check"],
        })
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(".github/workflows/adamantite.yml").text()
      expect(content).toContain("name: adamantite")
      expect(content).toContain("name: check")
      expect(content).toContain("verify:")
      expect(content).not.toContain("Old Workflow")
    })

    test("return FailedToWriteFile when writing the workflow fails", async () => {
      mkdirSync(".github/workflows", { recursive: true })
      writeFileSync(".github/workflows/adamantite.yml", "name: Old")
      chmodSync(".github/workflows/adamantite.yml", 0o444)

      const result = await runEither(
        github.update(tempDir, {
          packageManager: "bun",
          scripts: ["check"],
        })
      )

      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToWriteFile" })
      }
    })
  })
})
