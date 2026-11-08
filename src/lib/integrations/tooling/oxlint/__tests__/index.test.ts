import process from "node:process"
import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { formatJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  const target = `${process.platform}-${process.arch}${process.platform === "linux" ? "-gnu" : process.platform === "win32" ? "-msvc" : ""}`
  return createFileSystemTestContext({
    files: {
      "/usr/bin/ldd": "GNU libc",
      [`node_modules/oxlint/dist/oxlint.${target}.node`]: "",
      ...files,
    },
    root: ROOT,
  })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([
    files.layer,
    Path.layer,
    makeModuleResolverLayer(ROOT, { "oxlint/package.json": "node_modules/oxlint/package.json" }),
  ])
}

function runAssess(files: FileSystemTestContext) {
  return readProject(ROOT).pipe(
    Effect.flatMap((project) => oxlint.assess(project)),
    provideFiles(files)
  )
}

function makePackageJson(manifest: PackageJson) {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...manifest }, null, 2)
}

describe("oxlint", () => {
  describe("create", () => {
    it.effect("create a config that assess accepts", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        yield* oxlint.create(ROOT).pipe(provideFiles(files))

        expect(yield* runAssess(files)).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )
  })

  describe("assess", () => {
    it.effect("report the removed shadcn preset import without changing the project", () =>
      Effect.gen(function* () {
        const config = toOxlintTsConfigContent(["tailwind"]).replaceAll(
          "adamantite/lint/tailwind",
          "adamantite/lint/shadcn"
        )
        const manifest = makePackageJson({
          devDependencies: { oxlint: oxlint.version },
          scripts: { check: "adamantite check" },
        })
        const files = makeFiles({ "oxlint.config.ts": config, "package.json": manifest })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              currentState: expect.stringContaining("adamantite/lint/shadcn"),
              goal: expect.arrayContaining([
                expect.stringContaining("adamantite/lint/tailwind"),
                expect.stringContaining("shadcn/*"),
                expect.stringContaining("settings.shadcn"),
              ]),
              id: "tailwind-preset-migration",
              integration: "oxlint",
            },
          ],
        })
        expect(files.read("oxlint.config.ts")).toBe(config)
        expect(files.read("package.json")).toBe(manifest)
      })
    )

    it.effect("report no migration for the tailwind preset or an old import in a comment", () =>
      Effect.gen(function* () {
        const config = [
          '// Previously imported "adamantite/lint/shadcn".',
          toOxlintTsConfigContent(["tailwind"]),
        ].join("\n")
        const files = makeFiles({
          "oxlint.config.ts": config,
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        expect(yield* runAssess(files)).toMatchObject({ applicable: true, findings: [] })
      })
    )

    it.effect("report old declarations in an imported JSON fragment", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "layers.json": yield* formatJson({
            rules: { "adamantite/layers": ["error", { layers: { shared: [] }, root: "src" }] },
          }),
          "oxlint.config.ts":
            'import fragment from "./layers.json" with { type: "json" }; export default fragment\n',
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })
        const result = yield* runAssess(files)

        expect(result.applicable ? result.findings : []).toStrictEqual(
          expect.arrayContaining([
            expect.objectContaining({
              currentState: expect.stringContaining("layers.json"),
              id: "layers-map-migration",
            }),
          ])
        )
      })
    )

    it.effect.each([
      {
        file: "graph.json",
        config: 'import graph from "./graph.json" with { type: "json" }; export default { rules: { "adamantite/layers": ["error", { root: "src", layers: graph }] } }',
        before: '{ "shared": [] }',
        after: '{ "shared": { "imports": [] } }',
      },
      {
        file: "graph.ts",
        config: 'import graph from "./graph.ts"; export default { rules: { "adamantite/layers": ["error", { root: "src", layers: graph }] } }',
        before: "export default { shared: [] }",
        after: "export default { shared: { imports: [] } }",
      },
      {
        file: "options.ts",
        config: 'import { map as options } from "./options.ts"; export default { rules: { "adamantite/layers": ["error", options] } }',
        before: 'export const map = { root: "src", layers: { shared: [] } } as const',
        after: 'export const map = { root: "src", layers: { shared: { imports: [] } } } as const',
      },
    ])(
      "inspect imported layer values in $file without changing files",
      ({ file, config, before, after }) =>
        Effect.gen(function* () {
          const files = makeFiles({
            [file]: before,
            "oxlint.config.ts": config,
            "package.json": makePackageJson({
              devDependencies: { oxlint: oxlint.version },
              scripts: { check: "adamantite check" },
            }),
          })
          const snapshot = files.list().map((name) => [name, files.read(name)])
          const result = yield* runAssess(files)
          const findings = result.applicable ? result.findings : []

          expect(findings.filter((finding) => finding.id === "layers-map-migration")).toEqual(
            [expect.objectContaining({ currentState: expect.stringContaining(file) })]
          )
          expect(files.list().map((name) => [name, files.read(name)])).toStrictEqual(snapshot)

          files.write(file, after)
          const migrated = yield* runAssess(files)

          expect(migrated.applicable ? migrated.findings : []).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: "layers-map-migration" })])
          )
        })
    )

    it.effect.each(["check", "lint"])(
      "give read-only migration instructions with the %s script",
      (script) =>
        Effect.gen(function* () {
          const files = makeFiles({
            "oxlint.config.ts": 'export { default } from "./tooling/lint.ts"\n',
            "package.json": makePackageJson({
              devDependencies: { oxlint: oxlint.version },
              scripts: { [script]: script === "check" ? "adamantite check" : "oxlint" },
            }),
            "tooling/lint.ts": `export default {
  rules: {
    "adamantite/layers": ["error", {
      root: "src/lib",
      layers: { shared: [], workspace: ["shared"] },
      ignore: ["**/__tests__/**"],
    }],
  },
}\n`,
          })
          const before = files.list().map((file) => [file, files.read(file)])
          const result = yield* runAssess(files)

          expect(result.applicable).toBe(true)

          if (result.applicable) {
            const finding = result.findings.find((item) => item.id === "layers-map-migration")

            expect(finding).toMatchObject({
              currentState: expect.stringContaining("tooling/lint.ts"),
              goal: expect.arrayContaining([
                expect.stringContaining("imports"),
                expect.stringContaining("Preserve"),
                expect.stringContaining("adamantite check"),
              ]),
              integration: "oxlint",
            })
          }

          expect(files.list().map((file) => [file, files.read(file)])).toStrictEqual(before)

          files.write(
            "tooling/lint.ts",
            `export default {
  rules: {
    "adamantite/layers": ["error", {
      root: "src/lib",
      layers: { shared: { imports: [] }, workspace: { imports: ["shared"] } },
      ignore: ["**/__tests__/**"],
    }],
  },
}\n`
          )

          const after = yield* runAssess(files)

          expect(after.applicable ? after.findings.map((finding) => finding.id) : []).not.toContain(
            "layers-map-migration"
          )
        })
    )

    it.effect.each([
      {
        expected: true,
        source:
          'const graph = { shared: [] } as const; const map = { root: "src", layers: graph }; export default { rules: { "adamantite/layers": ["error", map] } }',
      },
      {
        expected: true,
        source:
          'export default { overrides: [{ rules: { "adamantite/layers": ["error", { root: "src", layers: { shared: [] } }] } }] }',
      },
      {
        expected: false,
        source:
          'const data = { layers: { unrelated: [] } }; export default { rules: { other: ["error", data] } }',
      },
      {
        expected: false,
        source:
          'export default { rules: { "adamantite/layers": ["error", { root: "src", layers: { shared: { imports: [] } } }] } }',
      },
    ])(
      "inspect literal layer declarations without running the config: $expected",
      ({ expected, source }) =>
        Effect.gen(function* () {
          const files = makeFiles({
            "oxlint.config.ts": source,
            "package.json": makePackageJson({
              devDependencies: { oxlint: oxlint.version },
              scripts: { check: "adamantite check" },
            }),
          })
          const result = yield* runAssess(files)

          expect(
            result.applicable
              && result.findings.some((finding) => finding.id === "layers-map-migration")
          ).toBe(expected)
        })
    )

    it.effect("report not applicable when no managed lint script exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({ devDependencies: { oxlint: oxlint.version } }),
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({
          applicable: false,
        })
      })
    )

    it.effect("report missing managed config when the managed check script exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [{ id: "missing-oxlint-config" }],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("report a finding when a legacy config is active", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ".oxlintrc.json": yield* formatJson({ rules: { semi: "error" } }),
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [{ id: "legacy-oxlint-config" }],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("report healthy when package and managed config are present", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": [
            'import { defineConfig } from "oxlint"',
            'import core from "adamantite/lint"',
            "",
            "export default defineConfig({",
            '  options: { "respectEslintDisableDirectives": true, "typeAware": true, "typeCheck": true },',
            "  extends: [core],",
            "})",
            "",
          ].join("\n"),
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
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

    it.effect("report a config update when managed check config lacks type-aware options", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": [
            'import { defineConfig } from "oxlint"',
            'import core from "adamantite/lint"',
            "",
            "export default defineConfig({",
            "  extends: [core],",
            "})",
            "",
          ].join("\n"),
          "package.json": makePackageJson({
            devDependencies: { oxlint: oxlint.version },
            scripts: { check: "adamantite check" },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [{ id: "invalid-oxlint-config" }],
          packageActions: [],
          warnings: [],
        })
      })
    )
  })
})
