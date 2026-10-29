import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import {
  checkIsMonorepo,
  getWorkspacePackageDirectories,
  readPnpmWorkspacePatterns,
  workspacePatternToRegExp,
} from "#lib/workspace/monorepo.ts"

const ROOT = "/project"

describe("readPnpmWorkspacePatterns", () => {
  it("read a block list with quotes and comments", () => {
    const content = [
      "packages:",
      "  - packages/* # apps and libraries",
      '  - "tooling/lint"',
      "  - '!packages/legacy'",
      "catalog:",
      "  effect: 4.0.0",
    ].join("\n")

    expect(readPnpmWorkspacePatterns(content)).toStrictEqual([
      "packages/*",
      "tooling/lint",
      "!packages/legacy",
    ])
  })

  it("read a flow list over several lines", () => {
    expect(
      readPnpmWorkspacePatterns('packages: [\n  "apps/*",\n  tooling/lint\n]\n')
    ).toStrictEqual(["apps/*", "tooling/lint"])
  })

  it("read a list after a YAML anchor", () => {
    expect(readPnpmWorkspacePatterns('packages: &workspacePackages ["apps/*"]\n')).toStrictEqual([
      "apps/*",
    ])
  })

  it.each([
    ["flow", 'shared: &workspacePackages ["apps/*", tooling/lint]\npackages: *workspacePackages\n'],
    [
      "block",
      "shared: &workspacePackages\n  - apps/*\n  - tooling/lint\npackages: *workspacePackages\n",
    ],
  ])("follow a YAML alias to an anchored %s list", (_, content) => {
    expect(readPnpmWorkspacePatterns(content)).toStrictEqual(["apps/*", "tooling/lint"])
  })

  it("stop an aliased block list at the end of its indented mapping", () => {
    const content = [
      "workspacePatterns:",
      "  active: &workspacePackages",
      "    - apps/*",
      "  archived:",
      "    - packages/*",
      "packages: *workspacePackages",
    ].join("\n")

    expect(readPnpmWorkspacePatterns(content)).toStrictEqual(["apps/*"])
  })

  it("read a block list whose items are not indented", () => {
    expect(
      readPnpmWorkspacePatterns("packages:\n- apps/*\n- tooling/lint\ncatalog:\n  a: 1\n")
    ).toStrictEqual(["apps/*", "tooling/lint"])
  })

  it("read no pattern without a packages key", () => {
    expect(readPnpmWorkspacePatterns("catalog:\n  effect: 4.0.0\n")).toStrictEqual([])
  })
})

describe("workspacePatternToRegExp", () => {
  it.each([
    ["packages/*", "packages/web", true],
    ["packages/*", "packages/group/web", false],
    ["packages/**", "packages/group/web", true],
    ["packages/**/web", "packages/web", true],
    ["packages/**/web", "packages/a/b/web", true],
    ["**/web", "apps/web", true],
    ["**/web", "web", true],
    ["./tooling/lint/", "tooling/lint", true],
    ["apps/web-*", "apps/web-admin", true],
    ["apps/web-*", "apps/api", false],
  ])("match %s against %s: %s", (pattern, directory, expected) => {
    expect(workspacePatternToRegExp(pattern).test(directory)).toBe(expected)
  })
})

describe("getWorkspacePackageDirectories", () => {
  it.effect("find nested packages with ** and leave out excluded packages", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": JSON.stringify({ workspaces: ["packages/**", "!packages/legacy"] }),
          "packages/group/web/node_modules/dependency/package.json": "{}",
          "packages/group/web/package.json": "{}",
          "packages/legacy/package.json": "{}",
        },
        root: ROOT,
      })

      const directories = yield* getWorkspacePackageDirectories(ROOT).pipe(
        Effect.provide(Layer.mergeAll(files.layer, Path.layer))
      )

      expect(directories).toStrictEqual(["/project/packages/group/web"])
    })
  )

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

      expect(directories).toStrictEqual([
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

      expect(directories).toStrictEqual(["/project/apps/site"])
    })
  )

  it.effect("read the package.json workspaces when pnpm-workspace.yaml has no packages", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
          "packages/api/package.json": "{}",
          "pnpm-workspace.yaml": "allowBuilds:\n  msgpackr-extract: false\n",
        },
        root: ROOT,
      })

      const result = yield* Effect.all([
        checkIsMonorepo(ROOT),
        getWorkspacePackageDirectories(ROOT),
      ]).pipe(Effect.provide(Layer.mergeAll(files.layer, Path.layer)))

      expect(result).toStrictEqual([true, ["/project/packages/api"]])
    })
  )
})
