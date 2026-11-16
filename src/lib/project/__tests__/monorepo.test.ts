import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { checkIsMonorepo, readWorkspace } from "#lib/project/monorepo.ts"
import { stringifyJson } from "#lib/shared/json.ts"

const ROOT = "/project"

function readPnpmWorkspace(pnpmWorkspace: string) {
  return readWorkspace(ROOT).pipe(
    Effect.provide([
      createFileSystemTestContext({
        files: { "package.json": "{}", "pnpm-workspace.yaml": pnpmWorkspace },
        root: ROOT,
      }).layer,
      Path.layer,
    ])
  )
}

describe("readWorkspace", () => {
  // `*` and `?` match inside one folder name, and a `**` segment matches zero or more folders.
  it.effect.each([
    { directory: "packages/web", expected: ["/project/packages/web"], pattern: "packages/*" },
    { directory: "packages/group/web", expected: [], pattern: "packages/*" },
    {
      directory: "packages/group/web",
      expected: ["/project/packages/group/web"],
      pattern: "packages/**",
    },
    { directory: "packages/web", expected: ["/project/packages/web"], pattern: "packages/**/web" },
    {
      directory: "packages/a/b/web",
      expected: ["/project/packages/a/b/web"],
      pattern: "packages/**/web",
    },
    { directory: "apps/web", expected: ["/project/apps/web"], pattern: "**/web" },
    { directory: "web", expected: ["/project/web"], pattern: "**/web" },
    { directory: "tooling/lint", expected: ["/project/tooling/lint"], pattern: "./tooling/lint/" },
    { directory: "apps/web-admin", expected: ["/project/apps/web-admin"], pattern: "apps/web-*" },
    { directory: "apps/api", expected: [], pattern: "apps/web-*" },
  ])(
    "find the package in $directory with the pattern $pattern",
    ({ directory, expected, pattern }) =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            [`${directory}/package.json`]: "{}",
            "package.json": yield* stringifyJson({ workspaces: [pattern] }),
          },
          root: ROOT,
        })

        const workspace = yield* readWorkspace(ROOT).pipe(Effect.provide([files.layer, Path.layer]))

        expect(workspace.packageDirectories).toStrictEqual(expected)
      })
  )

  // An exclusion matches the whole path, so `*` in it stays inside one folder name.
  it.effect("leave out only the packages that an exclusion with * names", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": yield* stringifyJson({ workspaces: ["packages/**", "!packages/*"] }),
          "packages/group/web/package.json": "{}",
          "packages/web/package.json": "{}",
        },
        root: ROOT,
      })

      const workspace = yield* readWorkspace(ROOT).pipe(Effect.provide([files.layer, Path.layer]))

      expect(workspace.packageDirectories).toStrictEqual(["/project/packages/group/web"])
    })
  )

  it.effect("find nested packages with ** and leave out excluded packages", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": yield* stringifyJson({ workspaces: ["packages/**", "!packages/legacy"] }),
          "packages/group/web/node_modules/dependency/package.json": "{}",
          "packages/group/web/package.json": "{}",
          "packages/legacy/package.json": "{}",
        },
        root: ROOT,
      })

      const workspace = yield* readWorkspace(ROOT).pipe(Effect.provide([files.layer, Path.layer]))

      expect(workspace).toStrictEqual({
        catalogs: {},
        isMonorepo: true,
        packageDirectories: ["/project/packages/group/web"],
      })
    })
  )

  it.effect("expand wildcard and literal patterns to existing directories", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": yield* stringifyJson({
            workspaces: ["packages/*", "tooling/**", "docs", "!packages/legacy"],
          }),
          "packages/README.md": "# Packages\n",
          "packages/api/package.json": "{}",
          "packages/web/package.json": "{}",
          "tooling/lint/package.json": "{}",
        },
        root: ROOT,
      })

      const workspace = yield* readWorkspace(ROOT).pipe(Effect.provide([files.layer, Path.layer]))

      expect(workspace).toStrictEqual({
        catalogs: {},
        isMonorepo: true,
        packageDirectories: [
          "/project/packages/api",
          "/project/packages/web",
          "/project/tooling/lint",
        ],
      })
    })
  )

  it.effect("prefer the patterns in pnpm-workspace.yaml", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "apps/site/package.json": "{}",
          "package.json": yield* stringifyJson({ workspaces: ["packages/*"] }),
          "packages/api/package.json": "{}",
          "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
        },
        root: ROOT,
      })

      const workspace = yield* readWorkspace(ROOT).pipe(Effect.provide([files.layer, Path.layer]))

      expect(workspace).toStrictEqual({
        catalogs: {},
        isMonorepo: true,
        packageDirectories: ["/project/apps/site"],
      })
    })
  )

  it.effect.each([
    { content: "allowBuilds:\n  msgpackr-extract: false\n", name: "has no packages" },
    { content: "packages:\n  - apps/*\n bad: [\n", name: "does not parse" },
  ])("read the package.json workspaces when pnpm-workspace.yaml $name", ({ content }) =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": yield* stringifyJson({ workspaces: ["packages/*"] }),
          "packages/api/package.json": "{}",
          "pnpm-workspace.yaml": content,
        },
        root: ROOT,
      })

      const result = yield* Effect.all([checkIsMonorepo(ROOT), readWorkspace(ROOT)], {
        concurrency: "unbounded",
      }).pipe(Effect.provide([files.layer, Path.layer]))

      expect(result).toStrictEqual([
        true,
        { catalogs: {}, isMonorepo: true, packageDirectories: ["/project/packages/api"] },
      ])
    })
  )

  it.effect("call a project with patterns a monorepo before any package exists", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": "{}",
          "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
        },
        root: ROOT,
      })

      const workspace = yield* readWorkspace(ROOT).pipe(Effect.provide([files.layer, Path.layer]))

      expect(workspace).toStrictEqual({ catalogs: {}, isMonorepo: true, packageDirectories: [] })
    })
  )

  it.effect("read a catalog version that YAML parses as a number", () =>
    Effect.gen(function* () {
      // YAML reads an unquoted `6` as a number, and pnpm reads the entry as version 6.
      const workspace = yield* readPnpmWorkspace(
        "packages:\n  - packages/*\ncatalog:\n  knip: 6\n  oxlint: 1.91.0\n"
      )

      expect(workspace.catalogs).toStrictEqual({ default: { knip: "6", oxlint: "1.91.0" } })
    })
  )

  it.effect("read the default and named catalogs, and keep the patterns with a bad catalog", () =>
    Effect.gen(function* () {
      const valid = yield* readPnpmWorkspace(
        [
          "packages:",
          "  - packages/*",
          "catalog:",
          "  oxlint: 1.2.3",
          "catalogs:",
          "  tools:",
          "    knip: ^6.0.0",
          "",
        ].join("\n")
      )

      const invalid = yield* readPnpmWorkspace("packages:\n  - packages/*\ncatalog: oxlint\n")

      expect([valid, invalid]).toStrictEqual([
        {
          catalogs: { default: { oxlint: "1.2.3" }, tools: { knip: "^6.0.0" } },
          isMonorepo: true,
          packageDirectories: [],
        },
        { catalogs: {}, isMonorepo: true, packageDirectories: [] },
      ])
    })
  )

  it.effect("find no packages in a project without workspace patterns", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": "{}", "packages/api/package.json": "{}" },
        root: ROOT,
      })

      const workspace = yield* readWorkspace(ROOT).pipe(Effect.provide([files.layer, Path.layer]))

      expect(workspace).toStrictEqual({ catalogs: {}, isMonorepo: false, packageDirectories: [] })
    })
  )
})
