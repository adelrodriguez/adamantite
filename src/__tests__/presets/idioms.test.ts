import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Order from "effect/Order"
import * as EffectRecord from "effect/Record"
import type { LintPreset } from "#lib/integrations/tooling/oxlint/presets.ts"
import { CommandRunner, type CommandRunOptions } from "#lib/execution/command-runner.ts"
import * as Toolchain from "#lib/toolchain/index.ts"
import {
  createFixtureProject,
  type FixtureLint,
  FIXTURES_DIRECTORY,
  lintFixtureProject,
  removeFixtureProject,
} from "./rule-fixtures.ts"
import { listStackPresets, listStacks, type Stack, STACK_OPTIONS, STACKS } from "./stacks.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const IDIOMS_DIR = join(import.meta.dirname, "fixtures/idioms")
const ONE_FIX_PASS = "https://github.com/oxc-project/oxc/issues/16118"

// Several fixes that the idioms show are suggestions, such as `eslint/no-useless-constructor` and
// `effecttsgo/map-const-to-as`, so the test fixes as `adamantite fix --suggested` does.
const FIX_LEVEL = "suggested"

/**
 * A file with a type error, which each run of the idioms must report. A run without the type check,
 * such as a run without the type-aware backend, reports nothing on a clean idiom, so only this
 * report shows that the run checked the types.
 */
const CANARY = {
  file: "canary.ts",
  report: { file: "canary.ts", line: 1, rule: "typescript/TS2322" },
  source: "export const answer: string = 42\n",
}

// The build writes the Oxlint entry beside the CLI, so a run from source starts its source. Oxfmt
// starts from this repository's install.
function toSource(options: CommandRunOptions): CommandRunOptions {
  if (options.name === "oxlint") {
    return { ...options, args: [join(REPO_ROOT, "src/oxlint.ts"), ...options.args.slice(1)] }
  }

  if (options.command === "oxfmt") {
    return { ...options, command: join(REPO_ROOT, "node_modules/.bin/oxfmt") }
  }

  return options
}

const SOURCE_RUNNER = Layer.effect(CommandRunner)(
  Effect.gen(function* () {
    const runner = yield* CommandRunner

    return CommandRunner.make((options) => runner.exitCode(toSource(options)))
  })
).pipe(Layer.provide(CommandRunner.layer), Layer.provide(NodeServices.layer))

interface SecondPass {
  /**
   * Path of the idiom relative to `fixable/`.
   */
  readonly file: string
  /**
   * The upstream issue that makes the second fix necessary.
   */
  readonly issue: string
}

interface IdiomTree {
  /**
   * The unstable Effect modules that the idioms use, which a target project must allow. See
   * "Effect" in the README.
   */
  readonly allowedUnstableApis?: readonly string[]
  /**
   * The preset that the idioms need. Their files are in `fixtures/idioms/<preset>`. Core idioms run
   * with every stack.
   */
  readonly preset: "core" | LintPreset
  /**
   * Each fixable idiom that one fix does not end, because a fix causes a new report. The test runs
   * a second fix for these idioms only. It fails when one fix ends a listed idiom, so the
   * correction upstream removes its entry.
   */
  readonly secondPasses: readonly SecondPass[]
}

const TREES: readonly IdiomTree[] = [
  {
    preset: "core",
    // `no-else-return` moves a statement, and the blank line that the spacing rule then needs
    // comes in the next pass.
    secondPasses: [{ file: "moved.ts", issue: ONE_FIX_PASS }],
  },
  {
    allowedUnstableApis: [
      "@effect/platform-node/NodeRuntime",
      "@effect/platform-node/NodeServices",
      "@effect/vitest",
      "effect/cli",
      "effect/FileSystem",
      "effect/Path",
    ],
    preset: "effect",
    secondPasses: [],
  },
  {
    // `react/jsx-fragments` writes `<>`, and `eslint/no-unused-vars` then reports the import of
    // `Fragment`, which the next pass removes.
    preset: "react",
    secondPasses: [{ file: "fragment.tsx", issue: ONE_FIX_PASS }],
  },
  {
    preset: "react-strict",
    secondPasses: [],
  },
  {
    preset: "nextjs",
    secondPasses: [],
  },
  {
    preset: "tanstack",
    secondPasses: [],
  },
  {
    preset: "tailwind",
    secondPasses: [],
  },
  {
    preset: "vitest",
    secondPasses: [],
  },
  {
    // `jest/prefer-strict-equal` writes `toStrictEqual(3)`, and `jest/prefer-to-be` then writes
    // `toBe(3)` in the next pass.
    preset: "jest",
    secondPasses: [{ file: "equal.test.ts", issue: ONE_FIX_PASS }],
  },
  {
    // Oxlint lints the script of a `.vue` file, and Oxfmt formats the whole file. No rule reads a
    // template, and the type check skips `.vue` scripts, so these idioms prove neither.
    preset: "vue",
    secondPasses: [],
  },
]

/**
 * The files below the folder, relative to it, with forward slashes, in sorted order. A tree without
 * the folder has no files in it.
 */
function listFiles(folder: string): string[] {
  if (!existsSync(folder)) {
    return []
  }

  const files = readdirSync(folder, { recursive: true, withFileTypes: true }).flatMap((entry) =>
    entry.isFile()
      ? [relative(folder, join(entry.parentPath, entry.name)).split(sep).join("/")]
      : []
  )

  return EffectArray.sort(files, Order.String)
}

function readFiles(folder: string, files: readonly string[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [file, readFileSync(join(folder, file), "utf8")]))
}

function listTreeStacks(preset: IdiomTree["preset"]): Stack[] {
  return preset === "core" ? EffectRecord.keys(STACKS) : listStacks(preset)
}

/**
 * The folders of the idioms, in sorted order. Each one is the folder of one tree.
 */
function listTreeFolders(): string[] {
  const folders = readdirSync(IDIOMS_DIR, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? [entry.name] : []
  )

  return EffectArray.sort(folders, Order.String)
}

/**
 * The number of files in the folder of each tree that runs with the stack.
 */
function countStackFiles(stack: Stack, folder: "clean" | "fixable"): number {
  return TREES.filter((tree) => listTreeStacks(tree.preset).includes(stack)).flatMap((tree) =>
    listFiles(join(IDIOMS_DIR, tree.preset, folder))
  ).length
}

describe("idiom trees", () => {
  it("have one tree for each folder of idioms", () => {
    expect(listTreeFolders()).toStrictEqual(
      EffectArray.sort(
        TREES.map((tree) => tree.preset),
        Order.String
      )
    )
  })

  it.each(EffectRecord.keys(STACKS))(
    "have a clean and a fixable idiom for the %s stack",
    (stack) => {
      expect(countStackFiles(stack, "clean")).toBeGreaterThan(0)
      expect(countStackFiles(stack, "fixable")).toBeGreaterThan(0)
    }
  )
})

describe.each(TREES)("$preset idioms", ({ allowedUnstableApis, preset, secondPasses }) => {
  const idiomsDir = join(IDIOMS_DIR, preset)
  const clean = listFiles(join(idiomsDir, "clean"))
  const fixable = listFiles(join(idiomsDir, "fixable"))
  const repeated = new Set(secondPasses.map((pass) => pass.file))

  it("have a clean idiom", () => {
    expect(clean.length).toBeGreaterThan(0)
  })

  it("have a fixed file for each fixable idiom", () => {
    expect(listFiles(join(idiomsDir, "fixed"))).toStrictEqual(fixable)
  })

  it("have no fixable idiom that equals its fixed file", () => {
    const sources = readFiles(join(idiomsDir, "fixable"), fixable)
    const fixed = readFiles(join(idiomsDir, "fixed"), fixable)

    expect(fixable.filter((file) => sources[file] === fixed[file])).toStrictEqual([])
  })

  describe.each(listTreeStacks(preset))("with the %s stack", (stack) => {
    let project: string
    let lint: FixtureLint

    beforeAll(() => {
      project = createFixtureProject({
        allowedUnstableApis,
        fixturesDir: idiomsDir,
        options: STACK_OPTIONS,
        presets: listStackPresets(stack),
      })

      // The type check of fix and check reports each file of the project, also outside the
      // files of the run, so the canary stays only for this run.
      const canary = join(project, FIXTURES_DIRECTORY, CANARY.file)

      writeFileSync(canary, CANARY.source)
      lint = lintFixtureProject(project)
      rmSync(canary)
    })

    afterAll(() => {
      removeFixtureProject(project)
    })

    it("lint each file of the tree and the canary", () => {
      expect(lint.files).toBe(listFiles(idiomsDir).length + 1)
    })

    it("check the types", () => {
      expect(lint.reports.filter((report) => report.file === CANARY.file)).toStrictEqual([
        CANARY.report,
      ])
    })

    it.each(clean)("report nothing in clean/%s", (file) => {
      expect(lint.reports.filter((report) => report.file === `clean/${file}`)).toStrictEqual([])
    })

    it.live("keep each clean idiom unchanged after fix", () =>
      Effect.gen(function* () {
        yield* Toolchain.fix({
          cwd: project,
          files: [`${FIXTURES_DIRECTORY}/clean`],
          level: FIX_LEVEL,
        })

        expect(readFiles(join(project, FIXTURES_DIRECTORY, "clean"), clean)).toStrictEqual(
          readFiles(join(idiomsDir, "clean"), clean)
        )
      }).pipe(Effect.provide(SOURCE_RUNNER))
    )

    it.live.skipIf(fixable.length === 0)(
      "rewrite each fixable idiom to its fixed file, which check accepts and a further fix keeps",
      () =>
        Effect.gen(function* () {
          const fixed = readFiles(join(idiomsDir, "fixed"), fixable)

          function readFixable() {
            return readFiles(join(project, FIXTURES_DIRECTORY, "fixable"), fixable)
          }

          // Fix fails while a report stays, as after the first pass of a known second pass, so
          // the test reads the files to see the result.
          yield* Effect.ignore(
            Toolchain.fix({
              cwd: project,
              files: [`${FIXTURES_DIRECTORY}/fixable`],
              level: FIX_LEVEL,
            })
          )

          const once = readFixable()

          expect(EffectRecord.filter(once, (_, file) => !repeated.has(file))).toStrictEqual(
            EffectRecord.filter(fixed, (_, file) => !repeated.has(file))
          )
          expect([...repeated].filter((file) => once[file] === fixed[file])).toStrictEqual([])

          if (repeated.size > 0) {
            yield* Effect.ignore(
              Toolchain.fix({
                cwd: project,
                files: [...repeated].map((file) => `${FIXTURES_DIRECTORY}/fixable/${file}`),
                level: FIX_LEVEL,
              })
            )
          }

          expect(readFixable()).toStrictEqual(fixed)

          const checked = yield* Effect.exit(
            Toolchain.check({ cwd: project, files: [`${FIXTURES_DIRECTORY}/fixable`] })
          )

          expect(checked).toStrictEqual(Exit.void)

          yield* Toolchain.fix({
            cwd: project,
            files: [`${FIXTURES_DIRECTORY}/fixable`],
            level: FIX_LEVEL,
          })

          expect(readFixable()).toStrictEqual(fixed)
        }).pipe(Effect.provide(SOURCE_RUNNER))
    )
  })
})
