import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Order from "effect/Order"
import * as EffectRecord from "effect/Record"
import * as Bridge from "#lib/bridge/index.ts"
import * as Project from "#lib/project/index.ts"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { CommandRunner } from "#lib/shared/command-runner.ts"
import { IDIOM_TREES, IDIOMS_DIR, listFiles, listTreeStacks } from "#presets/__tests__/idioms.ts"
import {
  createFixtureProject,
  type FixtureLint,
  FIXTURES_DIRECTORY,
  lintFixtureProject,
  removeFixtureProject,
} from "#presets/__tests__/rule-fixtures.ts"
import { listStackPresets, type Stack, STACK_OPTIONS, STACKS } from "#presets/__tests__/stacks.ts"

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

const RUNNER = CommandRunner.layer.pipe(Layer.provideMerge(NodeServices.layer))

function readFiles(folder: string, files: readonly string[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [file, readFileSync(join(folder, file), "utf8")]))
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
  return IDIOM_TREES.filter((tree) => listTreeStacks(tree.preset).includes(stack)).flatMap((tree) =>
    listFiles(join(IDIOMS_DIR, tree.preset, folder))
  ).length
}

describe("idiom trees", () => {
  it("have one tree for each folder of idioms", () => {
    expect(listTreeFolders()).toStrictEqual(
      EffectArray.sort(
        IDIOM_TREES.map((tree) => tree.preset),
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

describe.each(IDIOM_TREES)("$preset idioms", ({ allowedUnstableApis, preset, secondPasses }) => {
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
        yield* Bridge.fix({
          files: [`${FIXTURES_DIRECTORY}/clean`],
          level: FIX_LEVEL,
        })

        expect(readFiles(join(project, FIXTURES_DIRECTORY, "clean"), clean)).toStrictEqual(
          readFiles(join(idiomsDir, "clean"), clean)
        )
      }).pipe(
        Effect.provideService(Project.Directory, project),
        Effect.provide([RUNNER, ModuleResolver.layer])
      )
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
            Bridge.fix({
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
              Bridge.fix({
                files: [...repeated].map((file) => `${FIXTURES_DIRECTORY}/fixable/${file}`),
                level: FIX_LEVEL,
              })
            )
          }

          expect(readFixable()).toStrictEqual(fixed)

          const checked = yield* Effect.exit(
            Bridge.check({ files: [`${FIXTURES_DIRECTORY}/fixable`] })
          )

          expect(checked).toStrictEqual(Exit.void)

          yield* Bridge.fix({
            files: [`${FIXTURES_DIRECTORY}/fixable`],
            level: FIX_LEVEL,
          })

          expect(readFixable()).toStrictEqual(fixed)
        }).pipe(
          Effect.provideService(Project.Directory, project),
          // `check` prints the output of its stages through `Stdio`.
          Effect.provide([RUNNER, NodeServices.layer, ModuleResolver.layer])
        )
    )
  })
})
