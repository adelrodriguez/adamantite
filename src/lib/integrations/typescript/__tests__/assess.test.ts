import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import type { Selection } from "#lib/project/selection.ts"
import { withConfigLoader } from "#__tests__/config-loader.ts"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import typescript, { detectPreset } from "#lib/integrations/typescript/index.ts"
import { readProject } from "#lib/project/project.ts"
import { stringifyJson } from "#lib/shared/json.ts"

const ROOT = "/project"

const EMPTY_SELECTION = {
  agents: false,
  ci: null,
  editors: [],
  presets: [],
  scripts: [],
  typescript: null,
} as const satisfies Selection

const RESETS = "node_modules/adamantite/dist/presets/typescript/resets/index.d.ts"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

/**
 * What `tsc --showConfig` reports for the package in each directory below `ROOT`: whether its
 * resolved `files` include the type resets, or that the command fails.
 */
type ShowConfig = Readonly<Record<string, "fails" | "plain" | "resets">>

function makeShowConfigLayer(showConfig: ShowConfig) {
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner)(
    ChildProcessSpawner.make((command) => {
      const directory = ChildProcess.isStandardCommand(command) ? (command.options.cwd ?? "") : ""
      const result = showConfig[directory.slice(ROOT.length + 1)] ?? "plain"

      const files =
        result === "resets"
          ? [`${"../".repeat(directory.split("/").length - 2)}${RESETS}`, "./index.ts"]
          : ["./index.ts"]

      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result === "fails" ? 1 : 0)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(1),
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.make(new TextEncoder().encode(JSON.stringify({ files }))),
          unref: Effect.succeed(Effect.void),
        })
      )
    })
  )
}

// TypeScript is installed at the root, so every package resolves it.
const TYPESCRIPT_FILES = {
  "node_modules/typescript/package.json": JSON.stringify({ bin: { tsc: "./bin/tsc" } }),
}

const TYPESCRIPT_RESOLUTIONS = {
  "typescript/package.json": "node_modules/typescript/package.json",
}

function provideFiles(files: FileSystemTestContext, showConfig: ShowConfig = {}) {
  return Effect.provide(
    withConfigLoader(
      Layer.mergeAll(
        files.layer,
        Path.layer,
        makeModuleResolverLayer(ROOT, TYPESCRIPT_RESOLUTIONS),
        makeShowConfigLayer(showConfig)
      )
    )
  )
}

// As the assessment decides: the lockfile selects the preset, or a project without one gets the
// preset that its configs show.
function assess(files: Record<string, string>, showConfig: ShowConfig = {}) {
  return readProject(ROOT).pipe(
    Effect.flatMap((project) =>
      Effect.gen(function* () {
        const preset = Option.isSome(project.lockfile)
          ? project.lockfile.value.selection.typescript
          : Option.getOrNull(yield* detectPreset(project))

        if (preset === null) {
          return { applicable: false } as const
        }

        const selection = { ...EMPTY_SELECTION, typescript: preset }

        return { applicable: true, ...(yield* typescript.assess(project, selection)) } as const
      })
    ),
    provideFiles(makeFiles({ ...TYPESCRIPT_FILES, ...files }), showConfig)
  )
}

describe("tsconfig", () => {
  describe("assess", () => {
    const packageJson = { name: "project" }

    it.effect.each<{ readonly configFiles: Record<string, string>; readonly name: string }>([
      { configFiles: {}, name: "no tsconfig.json" },
      {
        configFiles: { "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }) },
        name: "no extends",
      },
      {
        configFiles: { "tsconfig.json": JSON.stringify({ extends: "@company/tsconfig" }) },
        name: "another base config",
      },
    ])("skip a project with $name, whatever its scripts", ({ configFiles }) =>
      Effect.gen(function* () {
        for (const scripts of [undefined, { check: "adamantite check" }]) {
          const result = yield* assess({
            "package.json": yield* stringifyJson({ ...packageJson, scripts }),
            ...configFiles,
          })

          expect(result).toStrictEqual({ applicable: false })
        }
      })
    )

    it.effect("read a tsconfig.json with comments and a trailing comma", () =>
      Effect.gen(function* () {
        const result = yield* assess(
          {
            "package.json": yield* stringifyJson(packageJson),
            "tsconfig.json":
              '{\n  // Visit https://aka.ms/tsconfig\n  "extends": "adamantite/typescript",\n}\n',
          },
          { "": "resets" }
        )

        expect(result).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("accept either preset as a string or in an array, without any script", () =>
      Effect.gen(function* () {
        for (const preset of [
          "adamantite/typescript",
          ["./base.json", "adamantite/typescript"],
          "adamantite/tsconfig",
          ["./base.json", "adamantite/tsconfig"],
        ]) {
          const result = yield* assess(
            {
              "package.json": yield* stringifyJson(packageJson),
              "tsconfig.json": yield* stringifyJson({ extends: preset }),
            },
            { "": "resets" }
          )

          expect(result).toStrictEqual({
            applicable: true,
            findings: [],
            packageActions: [],
            warnings: [],
          })
        }
      })
    )

    it.effect.each([
      {
        expected: [{ id: "typescript-preset-in-library" }],
        manifest: { exports: "./dist/index.js", name: "library" },
        name: "report a library with exports",
      },
      {
        expected: [{ id: "typescript-preset-in-library" }],
        manifest: { name: "library", types: "./dist/index.d.ts" },
        name: "report a library with types",
      },
      {
        expected: [],
        manifest: { exports: "./dist/index.js", name: "app", private: true },
        name: "accept a private package",
      },
      {
        expected: [],
        manifest: { name: "app" },
        name: "accept a package without exports or types",
      },
    ])("$name whose TypeScript config loads the type resets", ({ expected, manifest }) =>
      Effect.gen(function* () {
        const result = yield* assess(
          {
            "package.json": yield* stringifyJson(manifest),
            "tsconfig.json": yield* stringifyJson({ extends: "adamantite/typescript" }),
          },
          { "": "resets" }
        )

        expect(result).toMatchObject({ applicable: true, findings: expected })
      })
    )

    it.effect("report workspace libraries that load the type resets through a shared base", () =>
      Effect.gen(function* () {
        const library = { exports: "./dist/index.js" }

        const result = yield* assess(
          {
            "package.json": yield* stringifyJson({ name: "root", private: true }),
            "packages/app/package.json": yield* stringifyJson({ name: "app", private: true }),
            "packages/app/tsconfig.json": yield* stringifyJson({ extends: "../../base.json" }),
            "packages/library/package.json": yield* stringifyJson({ ...library, name: "library" }),
            "packages/library/tsconfig.json": yield* stringifyJson({ extends: "../../base.json" }),
            "packages/plain/package.json": yield* stringifyJson({ ...library, name: "plain" }),
            "packages/plain/tsconfig.json": yield* stringifyJson({
              extends: "adamantite/tsconfig",
            }),
            "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
          },
          { "packages/app": "resets", "packages/library": "resets" }
        )

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              currentState: expect.stringContaining("`packages/library/tsconfig.json`"),
              id: "typescript-preset-in-library",
            },
          ],
        })
      })
    )

    it.effect.each<{ readonly name: string; readonly showConfig: ShowConfig }>([
      { name: "its config sets files, so TypeScript loads no resets", showConfig: {} },
      { name: "tsc --showConfig fails", showConfig: { "": "fails" } },
    ])("report no library finding when $name", ({ showConfig }) =>
      Effect.gen(function* () {
        const result = yield* assess(
          {
            "package.json": yield* stringifyJson({ name: "library", types: "./dist/index.d.ts" }),
            "tsconfig.json": yield* stringifyJson({
              extends: "adamantite/typescript",
              files: ["index.ts"],
            }),
          },
          showConfig
        )

        expect(result).toMatchObject({ applicable: true, findings: [] })
      })
    )

    it.effect("skip the library check when TypeScript is not installed", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({ name: "library", types: "./dist/index.d.ts" }),
          "tsconfig.json": yield* stringifyJson({ extends: "adamantite/typescript" }),
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) =>
            typescript.assess(project, { ...EMPTY_SELECTION, typescript: "typescript" })
          ),
          Effect.provide(
            withConfigLoader(
              Layer.mergeAll(
                files.layer,
                Path.layer,
                makeModuleResolverLayer(ROOT),
                makeShowConfigLayer({ "": "resets" })
              )
            )
          )
        )

        expect(result).toMatchObject({ findings: [] })
      })
    )
  })
})
