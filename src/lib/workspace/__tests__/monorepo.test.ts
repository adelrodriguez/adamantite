import { describe, expect, it, test } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import {
  getWorkspacePackageDirectories,
  readPnpmWorkspacePatterns,
} from "#lib/workspace/monorepo.ts"

const ROOT = "/project"

describe("readPnpmWorkspacePatterns", () => {
  test("read a block list with quotes and comments", () => {
    const content = [
      "packages:",
      "  - packages/* # apps and libraries",
      '  - "tooling/lint"',
      "  - '!packages/legacy'",
      "catalog:",
      "  effect: 4.0.0",
    ].join("\n")

    expect(readPnpmWorkspacePatterns(content)).toEqual([
      "packages/*",
      "tooling/lint",
      "!packages/legacy",
    ])
  })

  test("read a flow list over several lines", () => {
    expect(readPnpmWorkspacePatterns('packages: [\n  "apps/*",\n  tooling/lint\n]\n')).toEqual([
      "apps/*",
      "tooling/lint",
    ])
  })

  test("read no pattern without a packages key", () => {
    expect(readPnpmWorkspacePatterns("catalog:\n  effect: 4.0.0\n")).toEqual([])
  })
})

describe("getWorkspacePackageDirectories", () => {
  it.effect("expand wildcard and literal patterns to existing directories", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": JSON.stringify({
            workspaces: ["packages/*", "tooling/**", "docs", "!packages/legacy"],
          }),
          "packages/README.md": "# Packages\n",
          "packages/api/package.json": "{}",
          "packages/web/package.json": "{}",
          "tooling/lint/package.json": "{}",
        },
        root: ROOT,
      })

      const directories = yield* getWorkspacePackageDirectories(ROOT).pipe(
        Effect.provide(Layer.mergeAll(files.layer, Path.layer))
      )

      expect(directories).toEqual([
        "/project/packages/api",
        "/project/packages/web",
        "/project/tooling/lint",
      ])
    })
  )

  it.effect("prefer the patterns in pnpm-workspace.yaml", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "apps/site/package.json": "{}",
          "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
          "packages/api/package.json": "{}",
          "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
        },
        root: ROOT,
      })

      const directories = yield* getWorkspacePackageDirectories(ROOT).pipe(
        Effect.provide(Layer.mergeAll(files.layer, Path.layer))
      )

      expect(directories).toEqual(["/project/apps/site"])
    })
  )
})
