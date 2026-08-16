import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { createDependencyInstallerTestContext } from "#commands/__tests__/command-test-helpers.ts"
import migrationHardcodedNodeVersion from "#lib/migrations/hardcoded-node-version.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"

const ROOT = "/project"

const HARDCODED_WORKFLOW = `name: adamantite

jobs:
  verify:
    steps:
      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version: "26"
`

const MANAGED_PROJECT_FILES = {
  ".github/workflows/adamantite.yml": HARDCODED_WORKFLOW,
  "package.json": JSON.stringify(
    {
      name: "test-project",
      scripts: {
        check: "adamantite check",
      },
      version: "1.0.0",
    },
    null,
    2
  ),
}

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideServices(
  files: FileSystemTestContext,
  options?: Parameters<typeof createDependencyInstallerTestContext>[0]
) {
  const base = Layer.mergeAll(files.layer, Path.layer)

  return Effect.provide(
    Layer.mergeAll(
      base,
      NodeVersionResolver.layer.pipe(Layer.provide(base)),
      createDependencyInstallerTestContext(options).layer
    )
  )
}

describe("hardcodedNodeVersion", () => {
  it.effect("check reports not-applicable when no workflow exists", () =>
    Effect.gen(function* () {
      const files = makeFiles()

      const result = yield* migrationHardcodedNodeVersion
        .check({ cwd: ROOT })
        .pipe(provideServices(files))

      expect(result).toEqual({ status: "not-applicable", warnings: [] })
    })
  )

  it.effect("check reports not-applicable when the workflow already uses node-version-file", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".github/workflows/adamantite.yml":
          'name: adamantite\n          node-version-file: ".node-version"\n',
      })

      const result = yield* migrationHardcodedNodeVersion
        .check({ cwd: ROOT })
        .pipe(provideServices(files))

      expect(result).toEqual({ status: "not-applicable", warnings: [] })
    })
  )

  it.effect("check reports not-applicable when the workflow uses lts/*", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".github/workflows/adamantite.yml": 'name: adamantite\n          node-version: "lts/*"\n',
      })

      const result = yield* migrationHardcodedNodeVersion
        .check({ cwd: ROOT })
        .pipe(provideServices(files))

      expect(result).toEqual({ status: "not-applicable", warnings: [] })
    })
  )

  it.effect("check reports that a hard-coded Node.js version needs migration", () =>
    Effect.gen(function* () {
      const files = makeFiles(MANAGED_PROJECT_FILES)

      const result = yield* migrationHardcodedNodeVersion
        .check({ cwd: ROOT })
        .pipe(provideServices(files))

      expect(result).toMatchObject({ status: "needed" })
    })
  )

  it.effect("migrate points the workflow at the project's Node.js version file", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ...MANAGED_PROJECT_FILES,
        ".node-version": "22.19.0\n",
      })

      yield* migrationHardcodedNodeVersion.migrate({ cwd: ROOT }).pipe(provideServices(files))

      const workflow = files.read(".github/workflows/adamantite.yml")
      expect(workflow).toContain('node-version-file: ".node-version"')
      expect(workflow).not.toContain('node-version: "26"')
      yield* migrationHardcodedNodeVersion.validate({ cwd: ROOT }).pipe(provideServices(files))
    })
  )

  it.effect("migrate falls back to lts/* when the project declares no Node.js version", () =>
    Effect.gen(function* () {
      const files = makeFiles(MANAGED_PROJECT_FILES)

      yield* migrationHardcodedNodeVersion.migrate({ cwd: ROOT }).pipe(provideServices(files))

      const workflow = files.read(".github/workflows/adamantite.yml")
      expect(workflow).toContain('node-version: "lts/*"')
      expect(workflow).not.toContain('node-version: "26"')
      yield* migrationHardcodedNodeVersion.validate({ cwd: ROOT }).pipe(provideServices(files))
    })
  )

  it.effect(
    "check reports not-applicable with a warning without CI-compatible managed scripts",
    () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ".github/workflows/adamantite.yml": HARDCODED_WORKFLOW,
          "package.json": JSON.stringify({ name: "test-project", version: "1.0.0" }, null, 2),
        })

        const result = yield* migrationHardcodedNodeVersion
          .check({ cwd: ROOT })
          .pipe(provideServices(files))

        expect(result).toEqual({
          status: "not-applicable",
          warnings: [
            "No CI-compatible managed scripts were found, so the GitHub Actions workflow was not updated.",
          ],
        })

        expect(files.read(".github/workflows/adamantite.yml")).toBe(HARDCODED_WORKFLOW)
      })
  )

  it.effect("check reports not-applicable with a warning for an unsupported package manager", () =>
    Effect.gen(function* () {
      const files = makeFiles(MANAGED_PROJECT_FILES)

      const result = yield* migrationHardcodedNodeVersion
        .check({ cwd: ROOT })
        .pipe(provideServices(files, { detectedPackageManager: { name: "aube" } }))

      expect(result).toEqual({
        status: "not-applicable",
        warnings: [
          "`aube` is not a supported package manager for CI workflow generation, so the GitHub Actions workflow was not updated.",
        ],
      })

      expect(files.read(".github/workflows/adamantite.yml")).toBe(HARDCODED_WORKFLOW)
    })
  )

  it.effect("check reports not-applicable with a warning when no package manager is detected", () =>
    Effect.gen(function* () {
      const files = makeFiles(MANAGED_PROJECT_FILES)

      const result = yield* migrationHardcodedNodeVersion
        .check({ cwd: ROOT })
        .pipe(provideServices(files, { detectedPackageManager: null }))

      expect(result).toEqual({
        status: "not-applicable",
        warnings: [
          "Could not detect a package manager, so the GitHub Actions workflow was not updated.",
        ],
      })
    })
  )
})
