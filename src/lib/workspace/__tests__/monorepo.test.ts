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
  it.effect.each([
    {
      content: [
        "packages:",
        "  - packages/* # apps and libraries",
        '  - "tooling/lint"',
        "  - '!packages/legacy'",
        "catalog:",
        "  effect: 4.0.0",
      ].join("\n"),
      expected: ["packages/*", "tooling/lint", "!packages/legacy"],
      name: "a block list with quotes and comments",
    },
    {
      content: 'packages: [\n  "apps/*",\n  tooling/lint\n]\n',
      expected: ["apps/*", "tooling/lint"],
      name: "a flow list over several lines",
    },
    {
      content: 'packages: &workspacePackages ["apps/*"]\n',
      expected: ["apps/*"],
      name: "a list after a YAML anchor",
    },
    {
      content:
        'shared: &workspacePackages ["apps/*", tooling/lint]\npackages: *workspacePackages\n',
      expected: ["apps/*", "tooling/lint"],
      name: "an alias to an anchored flow list",
    },
    {
      content:
        "shared: &workspacePackages\n  - apps/*\n  - tooling/lint\npackages: *workspacePackages\n",
      expected: ["apps/*", "tooling/lint"],
      name: "an alias to an anchored block list",
    },
    {
      content: [
        "workspacePatterns:",
        "  active: &workspacePackages",
        "    - apps/*",
        "  archived:",
        "    - packages/*",
        "packages: *workspacePackages",
      ].join("\n"),
      expected: ["apps/*"],
      name: "an alias to a list inside a mapping",
    },
    {
      content: "packages:\n- apps/*\n- tooling/lint\ncatalog:\n  a: 1\n",
      expected: ["apps/*", "tooling/lint"],
      name: "a block list whose items are not indented",
    },
    {
      content: "catalog:\n  effect: 4.0.0\n",
      expected: [],
      name: "no packages key",
    },
    { content: "", expected: [], name: "an empty file" },
    { content: "packages: apps/*\n", expected: [], name: "packages that are not a list" },
    {
      content: "packages:\n  - apps/*\n bad: [\n",
      expected: [],
      name: "a file that does not parse",
    },
  ])("read $name", ({ content, expected }) =>
    Effect.gen(function* () {
      expect(yield* readPnpmWorkspacePatterns(content)).toStrictEqual(expected)
    })
  )
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
