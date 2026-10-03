import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import effectTsgo from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const ROOT = "/project"
const PATCH = "effect-tsgo patch --oxlint --typescript"
const CONFIGURED_TSCONFIG = JSON.stringify({
  compilerOptions: { plugins: [{ diagnostics: false, name: "@effect/language-service" }] },
})

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

function runAssess(files: FileSystemTestContext) {
  return readPackageJson(ROOT).pipe(
    Effect.flatMap((packageJson) => effectTsgo.assess(ROOT, packageJson)),
    provideFiles(files)
  )
}

function makePackageJson(manifest: PackageJson) {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...manifest }, null, 2)
}

/**
 * A project that meets every goal, so a test changes only the part it checks.
 */
function makeConfiguredFiles(overrides: Record<string, string> = {}) {
  return makeFiles({
    "oxlint.config.ts": toOxlintTsConfigContent(["effect"]),
    "package.json": makePackageJson({
      devDependencies: { "@effect/tsgo": effectTsgo.version },
      scripts: { check: "adamantite check", prepare: PATCH },
    }),
    "tsconfig.json": CONFIGURED_TSCONFIG,
    ...overrides,
  })
}

describe("effect-tsgo", () => {
  describe("assess", () => {
    it.effect("report not applicable when the config does not import the effect preset", () =>
      Effect.gen(function* () {
        const files = makeConfiguredFiles({ "oxlint.config.ts": toOxlintTsConfigContent([]) })

        const result = yield* runAssess(files)

        expect(result).toEqual({ applicable: false, warnings: [] })
      })
    )

    it.effect("report nothing when the package, patch step, and tsconfig entry are in place", () =>
      Effect.gen(function* () {
        const files = makeConfiguredFiles()

        const result = yield* runAssess(files)

        expect(result).toEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("report the package, patch step, and tsconfig entry when all are missing", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": toOxlintTsConfigContent(["effect"]),
          "package.json": makePackageJson({ scripts: { check: "adamantite check" } }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            { id: "missing-@effect/tsgo" },
            {
              currentState: expect.stringContaining("has no `prepare` script"),
              id: "missing-effect-tsgo-patch",
            },
            {
              currentState: expect.stringContaining("does not configure"),
              id: "missing-effect-language-service-plugin",
            },
          ],
          packageActions: [{ package: "@effect/tsgo", type: "install_package" }],
        })
      })
    )

    it.effect("report a prepare script that does not patch both Oxlint and TypeScript", () =>
      Effect.gen(function* () {
        for (const prepare of ["husky", "effect-tsgo patch --oxlint"]) {
          const files = makeConfiguredFiles({
            "package.json": makePackageJson({
              devDependencies: { "@effect/tsgo": effectTsgo.version },
              scripts: { check: "adamantite check", prepare },
            }),
          })

          const result = yield* runAssess(files)

          expect(result).toMatchObject({
            findings: [
              {
                currentState: `The \`prepare\` script (\`${prepare}\`) does not run \`${PATCH}\`.`,
                id: "missing-effect-tsgo-patch",
              },
            ],
          })
        }
      })
    )

    it.effect("accept the patch step next to other prepare commands", () =>
      Effect.gen(function* () {
        const files = makeConfiguredFiles({
          "package.json": makePackageJson({
            devDependencies: { "@effect/tsgo": effectTsgo.version },
            scripts: { check: "adamantite check", prepare: `husky && ${PATCH}` },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({ findings: [] })
      })
    )

    it.effect("report a language service entry that reports its own diagnostics", () =>
      Effect.gen(function* () {
        const files = makeConfiguredFiles({
          "tsconfig.json": JSON.stringify({
            compilerOptions: { plugins: [{ name: "@effect/language-service" }] },
          }),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          findings: [
            {
              currentState: expect.stringContaining("reports its own diagnostics"),
              id: "missing-effect-language-service-plugin",
            },
          ],
        })
      })
    )

    it.effect("return guidance instead of a tsconfig finding in a monorepo", () =>
      Effect.gen(function* () {
        const files = makeConfiguredFiles({
          "package.json": makePackageJson({
            devDependencies: { "@effect/tsgo": effectTsgo.version },
            scripts: { check: "adamantite check", prepare: PATCH },
            workspaces: ["packages/*"],
          }),
          "tsconfig.json": "{}",
        })

        const result = yield* runAssess(files)

        expect(result).toEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [effectTsgo.monorepoTsconfigGuidance],
        })
      })
    )
  })

  describe("addPrepareScript", () => {
    it.effect("add the patch command when the project has no prepare script", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({ scripts: { test: "vitest" } }),
        })

        const result = yield* effectTsgo.addPrepareScript(ROOT).pipe(provideFiles(files))

        expect(result).toBe("added")
        expect(JSON.parse(files.read("package.json"))).toMatchObject({
          scripts: { prepare: PATCH, test: "vitest" },
        })
      })
    )

    it.effect("keep a prepare script that already patches or runs something else", () =>
      Effect.gen(function* () {
        for (const [prepare, expected] of [
          [`husky && ${PATCH}`, "present"],
          ["husky", "conflict"],
        ] as const) {
          const packageJson = makePackageJson({ scripts: { prepare } })
          const files = makeFiles({ "package.json": packageJson })

          const result = yield* effectTsgo.addPrepareScript(ROOT).pipe(provideFiles(files))

          expect(result).toBe(expected)
          expect(files.read("package.json")).toBe(packageJson)
        }
      })
    )
  })

  describe("addTsconfigPlugin", () => {
    it.effect("append the entry and keep other plugins and options", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": JSON.stringify({
            compilerOptions: { plugins: [{ name: "other" }], strict: true },
            extends: "adamantite/typescript",
          }),
        })

        const result = yield* effectTsgo.addTsconfigPlugin(ROOT).pipe(provideFiles(files))

        expect(result).toBe("updated")
        expect(JSON.parse(files.read("tsconfig.json"))).toEqual({
          compilerOptions: {
            plugins: [{ name: "other" }, { diagnostics: false, name: "@effect/language-service" }],
            strict: true,
          },
          extends: "adamantite/typescript",
        })
      })
    )

    it.effect("turn off diagnostics in an existing entry and keep its options", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": JSON.stringify({
            compilerOptions: {
              plugins: [{ allowedUnstableApis: ["effect/cli"], name: "@effect/language-service" }],
            },
          }),
        })

        yield* effectTsgo.addTsconfigPlugin(ROOT).pipe(provideFiles(files))

        expect(JSON.parse(files.read("tsconfig.json"))).toEqual({
          compilerOptions: {
            plugins: [
              {
                allowedUnstableApis: ["effect/cli"],
                diagnostics: false,
                name: "@effect/language-service",
              },
            ],
          },
        })
      })
    )

    it.effect("report a missing tsconfig.json without creating one", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const result = yield* effectTsgo.addTsconfigPlugin(ROOT).pipe(provideFiles(files))

        expect(result).toBe("missing")
        expect(files.exists("tsconfig.json")).toBe(false)
      })
    )

    it.effect("fail on plugins that are not an array", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": JSON.stringify({ compilerOptions: { plugins: {} } }),
        })

        const result = yield* effectTsgo
          .addTsconfigPlugin(ROOT)
          .pipe(provideFiles(files), Effect.result)

        expect(Result.isFailure(result) && result.failure._tag).toBe("InvalidConfigFormat")
      })
    )
  })
})
