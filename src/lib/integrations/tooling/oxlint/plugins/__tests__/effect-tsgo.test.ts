import { join } from "node:path"
import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { type CommandRunOptions, CommandRunner } from "#lib/execution/command-runner.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import effectTsgo from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const ROOT = "/project"
const PREPARE = "adamantite prepare"
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
      scripts: { check: "adamantite check", prepare: PREPARE },
    }),
    "tsconfig.json": CONFIGURED_TSCONFIG,
    ...overrides,
  })
}

function makeRunner(exitCode: number) {
  const invocations: CommandRunOptions[] = []
  const layer = Layer.succeed(
    CommandRunner,
    CommandRunner.make((options) =>
      Effect.sync(() => {
        invocations.push(options)
        return ChildProcessSpawner.ExitCode(exitCode)
      })
    )
  )

  return { invocations, layer }
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
              id: "missing-effect-tsgo-prepare",
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

    it.effect("report a prepare script that does not run adamantite prepare", () =>
      Effect.gen(function* () {
        for (const prepare of ["husky", "effect-tsgo patch --oxlint --typescript"]) {
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
                currentState: `The \`prepare\` script (\`${prepare}\`) does not run \`${PREPARE}\`.`,
                id: "missing-effect-tsgo-prepare",
              },
            ],
          })
        }
      })
    )

    it.effect("accept adamantite prepare next to other prepare commands", () =>
      Effect.gen(function* () {
        const files = makeConfiguredFiles({
          "package.json": makePackageJson({
            devDependencies: { "@effect/tsgo": effectTsgo.version },
            scripts: { check: "adamantite check", prepare: `${PREPARE} && husky` },
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
            scripts: { check: "adamantite check", prepare: PREPARE },
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
    it.effect("add adamantite prepare when the project has no prepare script", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({ scripts: { test: "vitest" } }),
        })

        const result = yield* effectTsgo.addPrepareScript(ROOT).pipe(provideFiles(files))

        expect(result).toBe("added")
        expect(JSON.parse(files.read("package.json"))).toMatchObject({
          scripts: { prepare: PREPARE, test: "vitest" },
        })
      })
    )

    it.effect("run adamantite prepare before the commands of an existing prepare script", () =>
      Effect.gen(function* () {
        // Husky's setup for a project below the Git root changes directory, so a command after it
        // would run outside the project.
        // The parentheses keep a fallback such as `|| true` from also catching a failed patch.
        for (const prepare of ["husky", "cd .. && husky frontend/.husky", "husky || true"]) {
          const files = makeFiles({ "package.json": makePackageJson({ scripts: { prepare } }) })

          const result = yield* effectTsgo.addPrepareScript(ROOT).pipe(provideFiles(files))

          expect(result).toBe("merged")
          expect(JSON.parse(files.read("package.json"))).toMatchObject({
            scripts: { prepare: `${PREPARE} && (${prepare})` },
          })
        }
      })
    )

    it.effect("keep a prepare script that already runs adamantite prepare", () =>
      Effect.gen(function* () {
        const packageJson = makePackageJson({ scripts: { prepare: `${PREPARE} && husky` } })
        const files = makeFiles({ "package.json": packageJson })

        const result = yield* effectTsgo.addPrepareScript(ROOT).pipe(provideFiles(files))

        expect(result).toBe("present")
        expect(files.read("package.json")).toBe(packageJson)
      })
    )
  })

  describe("checkNeedsPatch", () => {
    it.effect("need the patch only with the effect preset and a managed lint script", () =>
      Effect.gen(function* () {
        const cases = [
          [makeConfiguredFiles(), true],
          [makeConfiguredFiles({ "oxlint.config.ts": toOxlintTsConfigContent(["react"]) }), false],
          [
            makeConfiguredFiles({
              "package.json": makePackageJson({ scripts: { check: "oxlint" } }),
            }),
            false,
          ],
        ] as const

        for (const [files, expected] of cases) {
          const result = yield* readPackageJson(ROOT).pipe(
            Effect.flatMap((packageJson) => effectTsgo.checkNeedsPatch(ROOT, packageJson)),
            provideFiles(files)
          )

          expect(result).toBe(expected)
        }
      })
    )
  })

  describe("patch", () => {
    it.effect("run effect-tsgo patch for Oxlint and TypeScript", () =>
      Effect.gen(function* () {
        for (const [quiet, output] of [
          [true, "ignore"],
          [false, "inherit"],
        ] as const) {
          const runner = makeRunner(0)

          yield* effectTsgo
            .patch(ROOT, { quiet })
            .pipe(Effect.provide(Layer.merge(runner.layer, Path.layer)))

          expect(runner.invocations).toEqual([
            expect.objectContaining({
              args: ["patch", "--oxlint", "--typescript"],
              command: "effect-tsgo",
              cwd: ROOT,
              stderr: output,
              stdout: output,
            }),
          ])
          // A runner such as `pnpm dlx` does not put the project's executables on `PATH`.
          expect(runner.invocations[0]?.env?.["PATH"]).toMatch(
            new RegExp(`^${join(ROOT, "node_modules", ".bin")}`, "u")
          )
        }
      })
    )

    it.effect("fail when the patch fails", () =>
      Effect.gen(function* () {
        const result = yield* effectTsgo
          .patch(ROOT, { quiet: true })
          .pipe(Effect.provide(Layer.merge(makeRunner(1).layer, Path.layer)), Effect.result)

        expect(Result.isFailure(result) && result.failure._tag).toBe("CommandFailed")
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
