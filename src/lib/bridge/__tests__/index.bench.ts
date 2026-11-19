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

const RUNS = 20

const TEST_TIMEOUT = 10 * 60 * 1000

const ONE_FILE = {
  effect: "src/effect/clean/layers.ts",
  jest: "src/jest/clean/calc.test.ts",
  react: "src/react/clean/todo-list.tsx",
  vue: "src/vue/clean/use-search.ts",
} as const satisfies Record<Stack, string>

const VERSIONED_PACKAGES = ["oxlint", "oxfmt", "tsrs", "typescript", "@effect/tsgo"]

const CANARY = { file: "src/canary.ts", source: "export const answer: string = 42\n" }

const JSON_FILES = ["package.json", "tsconfig.json"]

const CLI = "node_modules/adamantite/bin/adamantite"
const OXLINT_ENTRY = join("node_modules/adamantite/dist", OXLINT_ENTRY_FILE)
const OXLINT_BIN = "node_modules/oxlint/bin/oxlint"

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

interface TargetProject {
  readonly env: NodeJS.ProcessEnv
  readonly mismatch: string | null
  readonly oxlintEnv: NodeJS.ProcessEnv
  readonly programFiles: number
  readonly root: string
  readonly trees: readonly IdiomTree[]
  readonly versions: Record<string, string>
}

// A link to the whole repository would let Oxlint find the repository's own config.
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

async function createTargetProject(stack: Stack): Promise<TargetProject> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `adamantite-bench-${stack}-`)))
  const nodeModules = join(root, "node_modules")
  const presets: readonly string[] = STACKS[stack]
  const trees = IDIOM_TREES.filter((tree) => listTreeStacks(tree.preset).includes(stack))

  linkFixturePackages(nodeModules)
  linkAdamantite(nodeModules)

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

function countProjectFiles(project: TargetProject): number {
  return listFiles(project.root).filter((file) => !file.startsWith("node_modules/")).length
}

type Step = Data.TaggedEnum<{
  Adamantite: { readonly args: readonly string[] }
  Oxfmt: { readonly args: readonly string[] }
  Oxlint: { readonly args: readonly string[] }
}>

const Step = Data.taggedEnum<Step>()

const isOxlint = Step.$is("Oxlint")

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

interface Fixable {
  readonly excluded: BenchmarkMeta["excluded"]
  readonly files: ReadonlyArray<{
    readonly fixed: string
    readonly path: string
    readonly source: string
  }>
}

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

interface Operation {
  readonly commands: readonly Command[]
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

  describe.shuffle("operations", () => {
    test.for(OPERATIONS)(
      "$name",
      { timeout: TEST_TIMEOUT },
      async (operation, { annotate, bench }) => {
        const startedAt = new Date().toISOString()
        const files = operation.files(stack)
        const fixable = operation.fixes ? listFixable(project) : undefined

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

        const options = { iterations: RUNS, time: 0, warmup: false }
        const [only, ...others] = registrations

        await (only !== undefined && others.length === 0
          ? only.run(options)
          : bench.compare(...registrations, options))
      }
    )
  })
})
