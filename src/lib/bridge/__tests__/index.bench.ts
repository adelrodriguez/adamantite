/**
 * Time `adamantite check` and `adamantite fix` in a target project for each stack, and the direct
 * Oxfmt and Oxlint commands that they run. `pnpm run bench` runs this file, and
 * `scripts/bench-reporter.ts` writes the report. See `docs/benchmarks.md`.
 *
 * Each project holds the idiom fixtures of its stack, imports the built presets by their package
 * names, and has the configs that `init` writes. The first run of each command validates its exit
 * code and its file selection. Each timed run throws on an unexpected exit code, which fails the
 * test, so the report never shows a failed run as a fast one.
 */
import { type SpawnSyncReturns, spawnSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import process from "node:process"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as EffectRecord from "effect/Record"
import * as Schema from "effect/Schema"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { toOxfmtTsConfigContent } from "#lib/integrations/oxfmt/config.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/oxlint/config.ts"
import { OXLINT_ENTRY_FILE } from "#lib/integrations/oxlint/entry.ts"
import { resolveOxlintRuntime, StockPart, toBackendEnv } from "#lib/integrations/oxlint/runtime.ts"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { linkFixturePackages } from "#presets/__tests__/fixture-packages.ts"
import {
  IDIOM_TREES,
  IDIOMS_DIR,
  type IdiomTree,
  listFiles,
  listTreeStacks,
} from "#presets/__tests__/idioms.ts"
import { type Stack, STACKS } from "#presets/__tests__/stacks.ts"
import { BENCH_ANNOTATION, type BenchmarkMeta } from "../../../../scripts/bench-reporter.ts"

const REPO_ROOT = join(import.meta.dirname, "../../../..")

/**
 * The timed runs of each command. The first run, which validates the command, is not one of them.
 */
const RUNS = 20

// A test runs each command `RUNS + 1` times. A fix then a check of the React stack takes about 1.5
// seconds.
const TEST_TIMEOUT = 10 * 60 * 1000

/**
 * The file that the one-file lint selects in each stack: ordinary code of the stack's framework.
 */
const ONE_FILE = {
  effect: "src/effect/clean/layers.ts",
  jest: "src/jest/clean/calc.test.ts",
  react: "src/react/clean/todo-list.tsx",
  vue: "src/vue/clean/use-search.ts",
} as const satisfies Record<Stack, string>

/**
 * The packages whose versions the report names.
 */
const VERSIONED_PACKAGES = ["oxlint", "oxfmt", "tsrs", "typescript", "@effect/tsgo"]

/**
 * A file with a type error. A lint without the type check reports nothing on the idioms, so only
 * this report shows that a run checked the types.
 */
const CANARY = { file: "src/canary.ts", source: "export const answer: string = 42\n" }

// The files that Oxfmt checks and Oxlint does not lint.
const JSON_FILES = ["package.json", "tsconfig.json"]

const CLI = "node_modules/adamantite/bin/adamantite"
const OXLINT_ENTRY = join("node_modules/adamantite/dist", OXLINT_ENTRY_FILE)
const OXLINT_BIN = "node_modules/oxlint/bin/oxlint"

// Adamantite starts the project's Oxfmt with Node.js, as it starts Oxlint, so the direct run starts
// Oxfmt's bin with Node.js too, without the shell script in `node_modules/.bin`.
const OXFMT_BIN = "node_modules/oxfmt/bin/oxfmt"

const PackageJson = Schema.Struct({
  files: Schema.optionalKey(Schema.Array(Schema.String)),
  version: Schema.String,
})

const decodePackageJson = Schema.decodeUnknownSync(Schema.fromJsonString(PackageJson))

function readPackageJson(folder: string) {
  return decodePackageJson(readFileSync(join(folder, "package.json"), "utf8"))
}

const OxlintJson = Schema.Struct({
  diagnostics: Schema.Array(Schema.Struct({ code: Schema.optional(Schema.String) })),
  number_of_files: Schema.Int,
})

const decodeOxlintJson = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJson))

// Oxfmt ends its output with `Finished in 31ms on 19 files using 14 threads.`
const FORMATTED_FILES = /on (?<files>\d+) files? using/g

// --- Project ---

interface TargetProject {
  /**
   * The variables of every run: `node_modules/.bin` first on `PATH`, as a package manager runs a
   * script, and no color, so every command prints the same output.
   */
  readonly env: NodeJS.ProcessEnv
  /**
   * Why a direct Oxlint run does not run as Adamantite runs Oxlint, or null when it does.
   */
  readonly mismatch: string | null
  /**
   * The variables of the type-aware backend that Adamantite gives Oxlint.
   */
  readonly oxlintEnv: NodeJS.ProcessEnv
  readonly programFiles: number
  readonly root: string
  readonly trees: readonly IdiomTree[]
  readonly versions: Record<string, string>
}

/**
 * Link the package as a target project installs it: the manifest and the files that `files` of
 * `package.json` publishes. A link to the whole repository would let Oxlint find the repository's
 * own config.
 */
function linkAdamantite(nodeModules: string): void {
  const folder = join(nodeModules, "adamantite")
  const published = (readPackageJson(REPO_ROOT).files ?? []).filter((file) => !file.startsWith("!"))

  mkdirSync(folder)

  for (const file of ["package.json", ...published]) {
    symlinkSync(join(REPO_ROOT, file), join(folder, file))
  }
}

function toTsConfig(trees: readonly IdiomTree[], stack: Stack): string {
  const presets: readonly string[] = STACKS[stack]

  const plugin = {
    allowedUnstableApis: trees.flatMap((tree) => tree.allowedUnstableApis ?? []),
    diagnostics: true,
    name: "@effect/language-service",
  }

  // The React and Next.js idioms use JSX, and the Node idioms use the Node types.
  const base = { jsx: "react-jsx", types: ["node"] }

  return JSON.stringify({
    compilerOptions: presets.includes("effect") ? { ...base, plugins: [plugin] } : base,
    extends: "adamantite/tsconfig",
  })
}

function spawn(command: string, args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
  })

  if (result.error !== undefined) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(
      `\`${[command, ...args].join(" ")}\` exited with ${result.status ?? result.signal}.\n${result.stdout}${result.stderr}`
    )
  }

  return result
}

function readRuntime(root: string) {
  return Effect.runPromise(
    resolveOxlintRuntime(root).pipe(
      Effect.provide([NodeFileSystem.layer, NodePath.layer, ModuleResolver.layer])
    )
  )
}

/**
 * Write a target project for the stack in a temporary folder: the idioms of the stack in
 * `src/<preset>`, the packages, and the configs that `init` writes for the stack.
 */
async function createTargetProject(stack: Stack): Promise<TargetProject> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `adamantite-bench-${stack}-`)))
  const nodeModules = join(root, "node_modules")
  const presets: readonly string[] = STACKS[stack]
  const trees = IDIOM_TREES.filter((tree) => listTreeStacks(tree.preset).includes(stack))

  linkFixturePackages(nodeModules)
  linkAdamantite(nodeModules)

  // A project without the Effect preset does not install the Effect build of Oxlint.
  if (!presets.includes("effect")) {
    rmSync(join(nodeModules, "@effect/tsgo"))
  }

  for (const tree of trees) {
    for (const folder of ["clean", "modules"]) {
      const source = join(IDIOMS_DIR, tree.preset, folder)

      if (existsSync(source)) {
        cpSync(source, join(root, "src", tree.preset, folder), { recursive: true })
      }
    }
  }

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: `bench-${stack}`, private: true, type: "module" })
  )
  writeFileSync(join(root, "tsconfig.json"), toTsConfig(trees, stack))
  writeFileSync(join(root, "oxlint.config.ts"), toOxlintTsConfigContent(STACKS[stack]))
  writeFileSync(join(root, "oxfmt.config.ts"), toOxfmtTsConfigContent())

  // `init` renders formatted configs. The JSON files get the layout of Oxfmt here, so a fix changes
  // only the fixable idioms.
  spawn(join(nodeModules, ".bin/oxfmt"), ["--write", ...JSON_FILES], root)

  const runtime = await readRuntime(root)
  const { FORCE_COLOR: _color, ...inherited } = process.env

  const programFiles = spawn(
    join(nodeModules, ".bin/tsc"),
    ["--listFilesOnly", "-p", "tsconfig.json"],
    root
  ).stdout.split("\n")

  return {
    env: {
      ...inherited,
      NO_COLOR: "1",
      PATH: `${join(nodeModules, ".bin")}${delimiter}${process.env["PATH"] ?? ""}`,
    },
    mismatch:
      runtime.binding instanceof StockPart
        ? null
        : "Adamantite runs Oxlint with the native binding of `@effect/tsgo`, which a direct `oxlint` run does not load, so the bench times no direct command.",
    oxlintEnv: toBackendEnv(runtime.backend),
    programFiles: programFiles.filter((line) => line.trim() !== "").length,
    root,
    trees,
    versions: Object.fromEntries(
      VERSIONED_PACKAGES.flatMap((name) => {
        const folder = join(nodeModules, name)

        return existsSync(folder) ? [[name, readPackageJson(folder).version]] : []
      })
    ),
  }
}

/**
 * The files of the project outside `node_modules`.
 */
function countProjectFiles(project: TargetProject): number {
  return listFiles(project.root).filter((file) => !file.startsWith("node_modules/")).length
}

// --- Commands ---

/**
 * One process of a command: the Adamantite CLI, or the Oxfmt check or the Oxlint lint that a
 * project runs without Adamantite.
 */
type Step = Data.TaggedEnum<{
  Adamantite: { readonly args: readonly string[] }
  Oxfmt: { readonly args: readonly string[] }
  Oxlint: { readonly args: readonly string[] }
}>

const Step = Data.taggedEnum<Step>()

const isOxlint = Step.$is("Oxlint")

/**
 * A timed command: processes that run in sequence and must each exit with 0. The commands of one
 * operation select the same files, so the report can compare them.
 */
interface Command {
  readonly name: "adamantite" | "direct"
  readonly steps: readonly Step[]
}

interface Process {
  readonly args: readonly string[]
  readonly command: string
  readonly env: NodeJS.ProcessEnv
}

function toProcess(project: TargetProject, step: Step, files: readonly string[]): Process {
  return Match.valueTags(step, {
    Adamantite: ({ args }) => ({ args: [CLI, ...args, ...files], command: "node", env: {} }),
    Oxfmt: ({ args }) => ({ args: [OXFMT_BIN, ...args, ...files], command: "node", env: {} }),
    Oxlint: ({ args }) => ({
      args: [OXLINT_BIN, ...args, ...files],
      command: "node",
      env: project.oxlintEnv,
    }),
  })
}

function display(processes: readonly Process[]): string {
  return processes.map((entry) => [entry.command, ...entry.args].join(" ")).join(" && ")
}

/**
 * Run each process of the command in the project. A process that does not exit with 0 throws, so
 * the run is invalid.
 */
function runCommand(
  project: TargetProject,
  processes: readonly Process[]
): Array<SpawnSyncReturns<string>> {
  return processes.map((entry) =>
    spawn(entry.command === "node" ? process.execPath : entry.command, entry.args, project.root, {
      ...project.env,
      ...entry.env,
    })
  )
}

// --- Validation ---

/**
 * Lint the selection with JSON output, as the command lints it, and return the number of linted
 * files. Every file must lint clean. A run of the whole project gets a canary with a type error,
 * which the lint must report, so the run checked the types.
 */
function validateLint(project: TargetProject, command: Command, files: readonly string[]): number {
  const direct = command.steps.some(isOxlint)
  const canary = files.length === 0
  const expected = canary ? countProjectFiles(project) - JSON_FILES.length : files.length

  const env = direct ? { ...project.env, ...project.oxlintEnv } : project.env

  if (canary) {
    writeFileSync(join(project.root, CANARY.file), CANARY.source)
  }

  try {
    const result = spawnSync(
      process.execPath,
      [direct ? OXLINT_BIN : OXLINT_ENTRY, "-f", "json", ...files],
      { cwd: project.root, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 }
    )

    const lint = decodeOxlintJson(result.stdout)

    expect({
      codes: lint.diagnostics.map((diagnostic) => diagnostic.code),
      files: lint.number_of_files,
    }).toStrictEqual({
      codes: canary ? ["typescript(TS2322)"] : [],
      files: canary ? expected + 1 : expected,
    })
  } finally {
    if (canary) {
      rmSync(join(project.root, CANARY.file))
    }
  }

  return expected
}

/**
 * Check that each Oxfmt run of the command named each file of the project, and return the number.
 */
function validateFormat(
  project: TargetProject,
  results: ReadonlyArray<SpawnSyncReturns<string>>
): number {
  const expected = countProjectFiles(project)

  const counts = results.flatMap((result) =>
    Array.from(`${result.stdout}${result.stderr}`.matchAll(FORMATTED_FILES), (match) =>
      Number(match.groups?.["files"])
    )
  )

  expect(counts.length).toBeGreaterThan(0)
  expect(counts.filter((count) => count !== expected)).toStrictEqual([])

  return expected
}

// --- Fix ---

interface Fixable {
  readonly excluded: BenchmarkMeta["excluded"]
  /**
   * Each fixable idiom, by its path in the project, with its source and its fixed form.
   */
  readonly files: ReadonlyArray<{
    readonly fixed: string
    readonly path: string
    readonly source: string
  }>
}

/**
 * The fixable idioms of the project. An idiom that one fix does not end stays out, because `check`
 * after one fix reports it.
 */
function listFixable(project: TargetProject): Fixable {
  const entries = project.trees.flatMap((tree) =>
    listFiles(join(IDIOMS_DIR, tree.preset, "fixable")).map((file) => ({
      file,
      path: `src/${tree.preset}/fixable/${file}`,
      secondPass: tree.secondPasses.find((pass) => pass.file === file),
      tree,
    }))
  )

  return {
    excluded: entries.flatMap(({ path, secondPass }) =>
      secondPass === undefined
        ? []
        : [
            {
              file: path,
              reason: `One fix does not end it, because Oxlint applies one pass of fixes: ${secondPass.issue}`,
            },
          ]
    ),
    files: entries.flatMap(({ file, path, secondPass, tree }) =>
      secondPass === undefined
        ? [
            {
              fixed: readFileSync(join(IDIOMS_DIR, tree.preset, "fixed", file), "utf8"),
              path,
              source: readFileSync(join(IDIOMS_DIR, tree.preset, "fixable", file), "utf8"),
            },
          ]
        : []
    ),
  }
}

function writeFixable(project: TargetProject, fixable: Fixable): void {
  for (const file of fixable.files) {
    mkdirSync(dirname(join(project.root, file.path)), { recursive: true })
    writeFileSync(join(project.root, file.path), file.source)
  }
}

/**
 * Check that the fix wrote each fixed form, then remove the fixable idioms, so the other operations
 * lint only the clean idioms.
 */
function verifyFixed(project: TargetProject, fixable: Fixable): void {
  try {
    expect(
      Object.fromEntries(
        fixable.files.map((file) => [
          file.path,
          readFileSync(join(project.root, file.path), "utf8"),
        ])
      )
    ).toStrictEqual(Object.fromEntries(fixable.files.map((file) => [file.path, file.fixed])))
  } finally {
    for (const tree of project.trees) {
      rmSync(join(project.root, "src", tree.preset, "fixable"), { force: true, recursive: true })
    }
  }
}

function toCommandMeta({ command, firstRunMs, name }: BenchmarkMeta["commands"][number]) {
  return { command, firstRunMs, name }
}

// --- Operations ---

interface Operation {
  /**
   * The Adamantite command first, then the direct commands that run the same tools on the same
   * files.
   */
  readonly commands: readonly Command[]
  /**
   * The files that the commands name. None selects the whole project.
   */
  readonly files: (stack: Stack) => readonly string[]
  readonly fixes: boolean
  readonly formats: boolean
  readonly lints: boolean
  readonly name: string
}

const OPERATIONS: readonly Operation[] = [
  {
    commands: [
      { name: "adamantite", steps: [Step.Adamantite({ args: ["check", "--only", "lint"] })] },
    ],
    files: (stack) => [ONE_FILE[stack]],
    fixes: false,
    formats: false,
    lints: true,
    name: "lint one file",
  },
  {
    commands: [
      { name: "adamantite", steps: [Step.Adamantite({ args: ["check", "--only", "lint"] })] },
      { name: "direct", steps: [Step.Oxlint({ args: ["--deny-warnings"] })] },
    ],
    files: () => [],
    fixes: false,
    formats: false,
    lints: true,
    name: "lint",
  },
  {
    commands: [
      { name: "adamantite", steps: [Step.Adamantite({ args: ["check", "--only", "format"] })] },
      { name: "direct", steps: [Step.Oxfmt({ args: ["--check"] })] },
    ],
    files: () => [],
    fixes: false,
    formats: true,
    lints: false,
    name: "format",
  },
  {
    commands: [
      { name: "adamantite", steps: [Step.Adamantite({ args: ["check"] })] },
      {
        name: "direct",
        steps: [Step.Oxfmt({ args: ["--check"] }), Step.Oxlint({ args: ["--deny-warnings"] })],
      },
    ],
    files: () => [],
    fixes: false,
    formats: true,
    lints: true,
    name: "check",
  },
  {
    commands: [
      {
        name: "adamantite",
        steps: [
          // The idioms show suggested fixes, such as `effecttsgo/map-const-to-as`.
          Step.Adamantite({ args: ["fix", "--suggested"] }),
          Step.Adamantite({ args: ["check"] }),
        ],
      },
    ],
    files: () => [],
    fixes: true,
    formats: true,
    lints: true,
    name: "fix then check",
  },
]

describe.each(EffectRecord.keys(STACKS))("%s stack", (stack) => {
  let project: TargetProject

  beforeAll(async () => {
    project = await createTargetProject(stack)
  }, TEST_TIMEOUT)

  afterAll(() => {
    rmSync(project.root, { force: true, recursive: true })
  })

  // The operations run in a random order, so no operation always gets the caches that another one
  // warmed.
  describe.shuffle("operations", () => {
    test.for(OPERATIONS)(
      "$name",
      { timeout: TEST_TIMEOUT },
      async (operation, { annotate, bench }) => {
        const startedAt = new Date().toISOString()
        const files = operation.files(stack)
        const fixable = operation.fixes ? listFixable(project) : undefined

        // A direct Oxlint run compares with Adamantite only when it loads the same Oxlint runtime.
        const mismatch = operation.commands.some((command) => command.steps.some(isOxlint))
          ? project.mismatch
          : null

        const commands = operation.commands.filter(
          (command) => mismatch === null || !command.steps.some(isOxlint)
        )

        let formattedFiles: number | null = null
        let lintedFiles: number | null = null

        const firstRuns = commands.map((command) => {
          const processes = command.steps.map((step) => toProcess(project, step, files))

          if (fixable !== undefined) {
            writeFixable(project, fixable)
          }

          const start = performance.now()
          const results = runCommand(project, processes)
          const firstRunMs = performance.now() - start

          // After the fix, the fixable idioms are in their fixed form, so they lint clean.
          formattedFiles = operation.formats ? validateFormat(project, results) : null
          lintedFiles = operation.lints ? validateLint(project, command, files) : null

          if (fixable !== undefined) {
            verifyFixed(project, fixable)
          }

          return { command: display(processes), firstRunMs, name: command.name, processes }
        })

        const [first, ...rest] = firstRuns

        if (first === undefined) {
          throw new Error(`The ${operation.name} operation has no command.`)
        }

        const meta: BenchmarkMeta = {
          commands: [toCommandMeta(first), ...rest.map(toCommandMeta)],
          excluded: fixable?.excluded ?? [],
          mismatch,
          operation: operation.name,
          project: { files: countProjectFiles(project), programFiles: project.programFiles },
          runs: RUNS,
          selection: { arguments: files, formattedFiles, lintedFiles },
          stack,
          startedAt,
          versions: project.versions,
        }

        // The reporter reads the metadata from the attachment, and the console shows the message.
        await annotate("Benchmark metadata", BENCH_ANNOTATION, {
          body: new TextEncoder().encode(JSON.stringify(meta)),
          contentType: "application/json",
        })

        const hooks =
          fixable === undefined
            ? {}
            : {
                afterEach: () => {
                  verifyFixed(project, fixable)
                },
                beforeEach: () => {
                  writeFixable(project, fixable)
                },
              }

        const registrations = firstRuns.map(({ name, processes }) =>
          // The function is synchronous, so tinybench does not call it once more to find out.
          bench(name, { async: false, ...hooks }, () => {
            runCommand(project, processes)
          })
        )

        // The first run warmed the caches, so the timed runs need no warmup.
        const options = { iterations: RUNS, time: 0, warmup: false }
        const [only, ...others] = registrations

        await (only !== undefined && others.length === 0
          ? only.run(options)
          : bench.compare(...registrations, options))
      }
    )
  })
})
