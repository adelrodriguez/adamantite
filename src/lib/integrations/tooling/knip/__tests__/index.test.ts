import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { toKnipTsConfigContent } from "#lib/integrations/tooling/knip/config.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
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
    Effect.flatMap((project) => knip.assess(project)),
    provideFiles(files)
  )
}

describe("knip", () => {
  describe("create", () => {
    it.effect("create a config that assess accepts", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({
            devDependencies: { knip: knip.version },
            name: "test-project",
            scripts: { analyze: "adamantite analyze" },
            version: "1.0.0",
          }),
        })

        yield* knip.create(ROOT).pipe(provideFiles(files))

        expect(yield* runAssess(files)).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("create a monorepo config that assess accepts", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({
            devDependencies: { knip: knip.version },
            name: "test-project",
            scripts: { analyze: "adamantite analyze" },
            version: "1.0.0",
            workspaces: ["packages/*"],
          }),
        })

        yield* knip.create(ROOT).pipe(provideFiles(files))

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
    it.effect("report not applicable when the managed analyze script is absent", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* formatJson({
            devDependencies: {
              knip: knip.version,
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

    it.effect("report a monorepo config that does not ignore sherif", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "knip.config.ts": toKnipTsConfigContent(),
          "package.json": yield* stringifyJson({
            devDependencies: { knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
            workspaces: ["packages/*"],
          }),
        })

        const result = yield* runAssess(files)

        expect(result.applicable && result.findings).toStrictEqual([
          expect.objectContaining({
            currentState: expect.stringContaining("ignoreDependencies.monorepo"),
            id: "invalid-knip-config",
          }),
        ])
      })
    )

    it.effect("report a sherif entry that sits outside ignoreDependencies", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "knip.config.ts": toKnipTsConfigContent().replace(
            "const config: KnipConfig = analyze",
            'const config: KnipConfig = { ...analyze, ignoreDependencies: ["@internal/*"], ignoreBinaries: ["sherif"] }'
          ),
          "package.json": yield* stringifyJson({
            devDependencies: { knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
            workspaces: ["packages/*"],
          }),
        })

        const result = yield* runAssess(files)

        expect(result.applicable && result.findings).toStrictEqual([
          expect.objectContaining({
            goal: [expect.stringContaining("ignoreDependencies: ignoreDependencies.monorepo")],
            id: "invalid-knip-config",
          }),
        ])
      })
    )

    it.effect.each([
      {
        config: toKnipTsConfigContent().replace(
          "const config: KnipConfig = analyze",
          "const config: KnipConfig = { ...analyze, ignoreDependencies: [/^sherif$/] }"
        ),
        name: "a regular expression",
      },
      {
        config: toKnipTsConfigContent().replace(
          "const config: KnipConfig = analyze",
          'const config: KnipConfig = { ...analyze, ignoreDependencies: ["sherif"] }'
        ),
        name: "name",
      },
      {
        config: toKnipTsConfigContent({ isMonorepo: true, usesEffectPreset: false }),
        name: "reference",
      },
    ])("accept a monorepo config that ignores sherif by $name", ({ config }) =>
      Effect.gen(function* () {
        const files = makeFiles({
          "knip.config.ts": config,
          "package.json": yield* stringifyJson({
            devDependencies: { knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
            workspaces: ["packages/*"],
          }),
        })

        const result = yield* runAssess(files)

        expect(result.applicable && result.findings).toStrictEqual([])
      })
    )

    it.effect("report the preset list when the named import is missing", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "knip.config.ts": toKnipTsConfigContent({
            isMonorepo: true,
            usesEffectPreset: false,
          }).replace("import analyze, { ignoreDependencies } from", "import analyze from"),
          "package.json": yield* stringifyJson({
            devDependencies: { knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
            workspaces: ["packages/*"],
          }),
        })

        const result = yield* runAssess(files)

        expect(result.applicable && result.findings).toStrictEqual([
          expect.objectContaining({ id: "invalid-knip-config" }),
        ])
      })
    )

    it.effect(
      "require the effect ignore list when oxlint.config.ts imports the effect preset",
      () =>
        Effect.gen(function* () {
          const packageJson = yield* stringifyJson({
            devDependencies: { knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          })

          const missing = makeFiles({
            "knip.config.ts": toKnipTsConfigContent(),
            "oxlint.config.ts": toOxlintTsConfigContent(["effect"]),
            "package.json": packageJson,
          })

          const configured = makeFiles({
            "knip.config.ts": toKnipTsConfigContent({ isMonorepo: false, usesEffectPreset: true }),
            "oxlint.config.ts": toOxlintTsConfigContent(["effect"]),
            "package.json": packageJson,
          })

          const missingResult = yield* runAssess(missing)
          const configuredResult = yield* runAssess(configured)

          expect(missingResult.applicable && missingResult.findings).toStrictEqual([
            expect.objectContaining({
              currentState: expect.stringContaining(
                "`ignoreDependencies: ignoreDependencies.effect`"
              ),
              id: "invalid-knip-config",
              reference: expect.objectContaining({
                content: expect.stringContaining("ignoreDependencies: ignoreDependencies.effect,"),
              }),
            }),
          ])
          expect(configuredResult.applicable && configuredResult.findings).toStrictEqual([])
        })
    )

    it.effect("require both ignore lists in a monorepo that uses the effect preset", () =>
      Effect.gen(function* () {
        const packageJson = yield* stringifyJson({
          devDependencies: { knip: knip.version },
          scripts: { analyze: "adamantite analyze" },
          workspaces: ["packages/*"],
        })

        const files = makeFiles({
          "knip.config.ts": toKnipTsConfigContent({ isMonorepo: true, usesEffectPreset: false }),
          "oxlint.config.ts": toOxlintTsConfigContent(["effect"]),
          "package.json": packageJson,
        })

        const configured = makeFiles({
          "knip.config.ts": toKnipTsConfigContent({ isMonorepo: true, usesEffectPreset: true }),
          "oxlint.config.ts": toOxlintTsConfigContent(["effect"]),
          "package.json": packageJson,
        })

        const result = yield* runAssess(files)
        const configuredResult = yield* runAssess(configured)

        expect(result.applicable && result.findings).toStrictEqual([
          expect.objectContaining({
            goal: [
              expect.stringContaining(
                "`ignoreDependencies: [...ignoreDependencies.monorepo, ...ignoreDependencies.effect]`"
              ),
            ],
            id: "invalid-knip-config",
          }),
        ])
        expect(configuredResult.applicable && configuredResult.findings).toStrictEqual([])
      })
    )

    it.effect("report a finding when a legacy config is active", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "knip.json": yield* formatJson({ entry: ["src/index.ts"] }),
          "package.json": yield* formatJson({
            devDependencies: {
              knip: knip.version,
            },
            name: "test-project",
            scripts: {
              analyze: "adamantite analyze",
            },
            version: "1.0.0",
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [{ id: "legacy-knip-config" }],
          packageActions: [],
          warnings: [],
        })
      })
    )
  })
})
