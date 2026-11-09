import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import sherif from "#lib/integrations/tooling/sherif/index.ts"
import { formatJson, stringifyJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT)])
}

function runAssess(files: FileSystemTestContext) {
  return readProject(ROOT).pipe(
    Effect.flatMap((project) => sherif.assess(project)),
    provideFiles(files)
  )
}

function makePackageJson(manifest: PackageJson) {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...manifest }, null, 2)
}

describe("sherif", () => {
  describe("assess", () => {
    it.effect("report not applicable when managed monorepo scripts are absent", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* formatJson({
            devDependencies: {
              sherif: sherif.version,
            },
            name: "test-project",
            version: "1.0.0",
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({
          applicable: false,
        })
      })
    )

    it.effect("report missing package for a managed analyze script in a monorepo", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({
            name: "test-project",
            scripts: { analyze: "adamantite analyze" },
            workspaces: ["packages/*"],
          }),
        })

        const result = yield* runAssess(files)

        expect(result.applicable).toBe(true)
        expect(result.applicable && result.packageActions).toStrictEqual([
          expect.objectContaining({ package: "sherif", type: "install_package" }),
        ])
      })
    )

    it.effect("accept a pnpm catalog entry at the required version", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({
            devDependencies: { sherif: "catalog:" },
            name: "test-project",
            scripts: { analyze: "adamantite analyze" },
          }),
          "pnpm-workspace.yaml": `packages:\n  - packages/*\ncatalog:\n  sherif: ${sherif.version}\n`,
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("report not applicable for a managed analyze script outside a monorepo", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({
            name: "test-project",
            scripts: { analyze: "adamantite analyze" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({ applicable: false })
      })
    )

    it.effect("report a script with another name that runs adamantite monorepo", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({
            devDependencies: { sherif: sherif.version },
            scripts: {
              analyze: "adamantite analyze",
              "lint:workspace": "adamantite monorepo --fix -- --select=highest",
              // Only a command that starts with `adamantite monorepo` is a legacy script.
              verify: "pnpm run check && adamantite monorepo",
            },
            workspaces: ["packages/*"],
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          findings: [
            {
              goal: [
                'Set `sherif.select` to `"highest"` in the root `package.json`.',
                "Remove the `lint:workspace` script from `package.json`.",
              ],
              id: "legacy-monorepo-scripts",
            },
          ],
        })
      })
    )

    it.effect("tell the reader where each custom Sherif flag goes", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({
            devDependencies: { sherif: sherif.version },
            scripts: {
              analyze: "adamantite analyze",
              "check:monorepo":
                "adamantite monorepo -- -i react --ignore-rule root-package-manager-field --fail-on-warnings",
            },
            workspaces: ["packages/*"],
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          findings: [
            {
              currentState: expect.stringContaining("`adamantite monorepo -- -i react"),
              goal: [
                'Add `"react"` to the `sherif.ignoreDependency` array in the root `package.json`.',
                'Add `"root-package-manager-field"` to the `sherif.ignoreRule` array in the root `package.json`.',
                "Set `sherif.failOnWarnings` to `true` in the root `package.json`.",
                "Remove the `check:monorepo` script from `package.json`.",
              ],
            },
          ],
        })
      })
    )

    it.effect("report a flag that both paired scripts carry once", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({
            devDependencies: { sherif: sherif.version },
            scripts: {
              analyze: "adamantite analyze",
              "check:monorepo": "adamantite monorepo -- -i react",
              "fix:monorepo": "adamantite monorepo --fix -- -i react",
            },
            workspaces: ["packages/*"],
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          findings: [
            {
              goal: [
                'Add `"react"` to the `sherif.ignoreDependency` array in the root `package.json`.',
                "Remove the `check:monorepo` script from `package.json`.",
                "Remove the `fix:monorepo` script from `package.json`.",
              ],
              notes: expect.arrayContaining([
                expect.stringContaining(
                  "`adamantite analyze --only monorepo --fix` replaces `fix:monorepo`"
                ),
              ]),
            },
          ],
        })
      })
    )

    it.effect("tell a project without analyze to adopt it", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({
            scripts: { "check:monorepo": "sherif --ignore-dependency tailwindcss" },
            workspaces: ["packages/*"],
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              currentState: expect.stringContaining("no managed `analyze` script"),
              goal: [
                expect.stringContaining("adamantite init --non-interactive --script analyze"),
                'Add `"tailwindcss"` to the `sherif.ignoreDependency` array in the root `package.json`.',
                "Remove the `check:monorepo` script from `package.json`.",
              ],
            },
          ],
          // Sherif is not managed until the project adopts `analyze`.
          packageActions: [],
        })
      })
    )
  })
})
