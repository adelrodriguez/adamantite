import { join } from "node:path"
import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { type CommandRunOptions, CommandRunner } from "#lib/execution/command-runner.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import effectTsgo from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/index.ts"
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
        // No package, prepare script, or tsconfig entry: each would be a finding with the preset.
        const files = makeFiles({
          "oxlint.config.ts": toOxlintTsConfigContent([]),
          "package.json": makePackageJson({ scripts: { check: "adamantite check" } }),
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({ applicable: false, warnings: [] })
      })
    )

    it.effect("report nothing when the package, patch step, and tsconfig entry are in place", () =>
      Effect.gen(function* () {
        const files = makeConfiguredFiles()

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({
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

        expect(result).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [expect.stringContaining("in a monorepo, add")],
        })
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

          expect(runner.invocations).toStrictEqual([
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
  })
})
