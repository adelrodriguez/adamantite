import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

function runAssess(files: FileSystemTestContext) {
  return readPackageJson(ROOT).pipe(
    Effect.flatMap((packageJson) => sherif.assess(ROOT, packageJson)),
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
          "package.json": JSON.stringify(
            {
              devDependencies: {
                sherif: sherif.version,
              },
              name: "test-project",
              version: "1.0.0",
            },
            null,
            2
          ),
        })

        const result = yield* runAssess(files)

        expect(result).toEqual({
          applicable: false,
          warnings: [],
        })
      })
    )

    it.effect("report missing package for a managed analyze script in a monorepo", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify({
            name: "test-project",
            scripts: { analyze: "adamantite analyze" },
            workspaces: ["packages/*"],
          }),
        })

        const result = yield* runAssess(files)

        expect(result.applicable).toBe(true)
        expect(result.applicable && result.packageActions).toEqual([
          expect.objectContaining({ package: "sherif", type: "install_package" }),
        ])
      })
    )

    it.effect("report not applicable for a managed analyze script outside a monorepo", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify({
            name: "test-project",
            scripts: { analyze: "adamantite analyze" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toEqual({ applicable: false, warnings: [] })
      })
    )

    it.effect("report missing package when the managed monorepo check script exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify(
            {
              name: "test-project",
              scripts: {
                "check:monorepo": "adamantite monorepo",
              },
              version: "1.0.0",
            },
            null,
            2
          ),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [{ id: "missing-sherif" }, { id: "legacy-monorepo-scripts" }],
          packageActions: [{ package: sherif.name, type: "install_package" }],
          warnings: [],
        })
      })
    )

    it.effect(
      "report only the legacy finding when the package and a legacy script are present",
      () =>
        Effect.gen(function* () {
          const files = makeFiles({
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  sherif: sherif.version,
                },
                name: "test-project",
                scripts: {
                  "fix:monorepo": "adamantite monorepo --fix",
                },
                version: "1.0.0",
              },
              null,
              2
            ),
          })

          const result = yield* runAssess(files)

          expect(result).toMatchObject({
            applicable: true,
            findings: [{ id: "legacy-monorepo-scripts" }],
            packageActions: [],
            warnings: [],
          })
        })
    )

    it.effect("report the managed legacy monorepo scripts", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({
            devDependencies: { sherif: sherif.version },
            scripts: {
              analyze: "adamantite analyze",
              "check:monorepo": "adamantite monorepo",
              "fix:monorepo": "adamantite monorepo --fix",
            },
            workspaces: ["packages/*"],
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              goal: [
                "Remove the `check:monorepo` script from `package.json`.",
                "Remove the `fix:monorepo` script from `package.json`.",
              ],
              id: "legacy-monorepo-scripts",
            },
          ],
          packageActions: [],
        })
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
