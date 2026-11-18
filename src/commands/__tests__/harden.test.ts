import type { PackageJson } from "type-fest"
import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Predicate from "effect/Predicate"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import type { AgentReach } from "#lib/hardening/agent-reach.ts"
import type { Selection } from "#lib/project/selection.ts"
import {
  makeHandoffRunner,
  makeLockfileFile,
  promptingLayer,
  nonProbeInvocations,
  OXLINT_COMMAND,
  runCommand,
  SKILL_FILES,
} from "#__tests__/command-test-helpers.ts"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { runLifecycle } from "#__tests__/lifecycle.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { createTerminalTestContext, type TestKey } from "#__tests__/terminal.ts"
import hardenCommand, { Report } from "#commands/harden.ts"
import { LintedOverrides } from "#lib/hardening/overrides.ts"
import { ProjectPath } from "#lib/hardening/project-files.ts"
import { PACKAGE as knip } from "#lib/integrations/knip/index.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts"

function manifest(value: PackageJson): string {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...value }, null, 2)
}

function getHeadings(markdown: string) {
  return markdown.match(/^#{1,3} .+$/gm) ?? []
}

function getSection(markdown: string, heading: string) {
  const start = markdown.indexOf(`\n${heading}\n`)

  if (start === -1) {
    throw new Error(`No \`${heading}\` section in the prompt`)
  }

  const end = markdown.slice(start + 1).search(/\n#{1,3} /)

  return end === -1 ? markdown.slice(start) : markdown.slice(start, start + 1 + end)
}

function getListItems(section: string) {
  return section.match(/^- .+$/gm) ?? []
}

function getMissingPhrases(section: string, phrases: readonly string[]) {
  return phrases.filter((phrase) => !section.includes(phrase))
}

// The phrases that each section must keep, so a failure names each lost one.
const REQUIRED_PHRASES = {
  "## 1. Explore the documentation": [
    "Start with each `AGENTS.md` above",
    "that the agent reach above lists as not reached, is a **discovery gap**",
    "Each link to a Markdown file that does not exist is a discovery gap too.",
    "the files that the instructions link to or tell agents to read, including files absent from the list",
    "**discovery gap**",
    "When the decisions record above exists, read it too.",
    "This step is done when each file in the documentation list, and each file that the instructions link to, has its mark.",
  ],
  "## 2. List the written standards": [
    "Each written standard is a candidate, and goes on to step 5",
    "Continue when every written standard has a source location and a candidate entry.",
  ],
  "## 3. Survey the code": [
    "the command that gives the count",
    "A construct that the code never uses is not a standard by itself.",
    "A rule that a commit removed is a **decision**",
    "This step is done when each area has its candidates",
  ],
  "## 4. Read the fix history": [
    "Name the mistake in one sentence",
    "Skip the fixes of logic that only one place has",
    "Find the commit that added the mistake",
    "two or more fixes have it",
    "The code before the fix is the case that the rule must report",
    "When the history has fewer commits, read all of them",
    "This step is done when each fix has its mark",
  ],
  "## 5. Drop what a tool already enforces": [
    "For each written standard from step 2 and each candidate from steps 3 and 4",
    "run `adamantite rule try`",
    "`adamantite rule try <rule> --current --report <case>` shows what the config reports now",
    "`adamantite rule try <rule> [--options '<json array>'] --report <case> --accept <case>`",
    "or `<path>=<file>` to lint the content of `<file>` at `<path>`",
    "Exit 2 means that the trial is not evidence",
    "A report from a rule that only the trial turns on is not enforcement",
    "When a tool enforces only part of a written standard, keep the other part as a candidate.",
  ],
  "## 6. Find the gaps in the existing rules": [
    "This step starts from the rules that the project already has",
    "`require()`, `import()`, `export … from`, `import type`, and the path aliases",
    "run `adamantite rule try <rule> --current --report <control> --report <missed form>`",
    "The gap is confirmed when it reports the control and does not report the missed form.",
    "the files that the standard applies to and that the glob does not match",
    "prepare temporary valid and invalid cases",
    'each file that the overrides above mark "no longer breaks the rule" or "does not exist" is a candidate',
    "Many suppressions of one rule are a **decision**",
    "A gap that is not confirmed is a candidate too",
    "is not a candidate: list it under **Decisions** as a report for the maintainers of that package",
    'This step is done when each rule has its gaps or the note "none found".',
  ],
  "## 7. Place each candidate on the enforcement ladder": [
    "For a candidate from step 4, use the code before and after one of its fixes.",
    "A native rule, such as a file-name rule, comes before a custom rule",
    "Write one combined `no-restricted-imports` for each set of files",
    "**Project check:**",
    "one case that the rule must report and one similar case that it must accept",
    "Say what the rule guarantees and what it does not",
    "is a decision, not a candidate",
    "One that matches an entry is settled: do not propose it or ask about it again.",
    "List it under **Also considered** in step 8, with the heading of its entry.",
    "evidence that is newer than the date of the entry, such as fix commits after it",
    "Continue when every remaining candidate has a proposed step, evidence, limits, and cases",
  ],
  "## 8. Show the candidates and wait for approval": [
    "or the fix commits",
    "each rule with many suppressions, and each gap in a shipped rule that no option can close",
    "Score each candidate from 1 to 5",
    "name it on the first line of the report and state the fallback you used",
    "put the approval question last in the report, with no text after it",
    "Show the candidates with a score of 4 or 5, from the highest score to the lowest.",
    "**Decisions:**",
    "**Discovery gaps:**",
    "**Also considered:**",
    "Wait until the user names the candidates to write or approves none",
    "When no human can approve",
    "stop after this step.",
    "Write no file, also not the decisions record.",
    "After the user answers, write the decisions record, also when the user approves none.",
    "one for each item of the Decisions list that the user resolved",
    "An approved candidate needs no entry, because its rule or instruction is the trace.",
    "and each candidate or decision that step 7 matched with an entry of the decisions record",
    "- Decision: rejected",
    "- Date: ",
    "- Reason: ",
    "- Evidence: ",
    "Tell the user to commit the record",
  ],
  "## 9. Write the approved standards": [
    "**Gap in a custom rule:** create a temporary regression case first, and use RuleTester to see it fail",
    "Continue when every approved candidate is implemented",
    'Follow its "Custom rules" section and linked guide',
    "When no file has the form, tell the user that the change is not verified.",
    "Do not change a rule that a preset or plugin ships.",
    "remove only the files that no longer break the rule",
    "`adamantite rule add <name>`",
    "skills/adamantite/SKILL.md",
    "pass it with `--dir`",
    "states the standard and why it exists",
    "delete the instruction of each standard that a rule now checks",
    "keep the other part as the instruction",
    "keep the code that a new rule reports as it is",
    "turns the rule off only in the files that break it now",
    "Do not set the rule to `warn`: `adamantite check` fails on warnings.",
    "`CODING_STANDARDS.md`",
    "When no `AGENTS.md` points to `CODING_STANDARDS.md`, add the pointer to the root `AGENTS.md`.",
    "add each approved pointer to the `AGENTS.md` that the gap names, or to a file that it reaches, as a Markdown link",
  ],
  "## Check the result": [
    "The decisions record has an entry for each candidate that the user did not approve and each decision that the user resolved",
  ],
  "## Verify": [
    "no temporary verification cases, fixtures, or verification-only helpers remain",
    "Do not add saved rule tests or CI steps unless the user requests them",
    "run `adamantite harden` again without a terminal and read its agent reach",
    "`adamantite check` and `adamantite doctor`",
    "Both must exit 0.",
    "When you changed a project check, also run that check with the project's own command",
    "add the file to the override as step 9 says, not a disable comment",
    "If a check is blocked, record its command and reason instead of claiming completion.",
  ],
} satisfies Readonly<Record<string, readonly string[]>>

// `node_modules` holds the Adamantite that runs the command.
const ADAMANTITE_MODULE = {
  "node_modules/adamantite/package.json": JSON.stringify({
    name: "adamantite",
    version: getPackageVersion(),
  }),
}

// Node.js resolves `adamantite/lint` to this file, as Oxlint loads the preset.
// The project installs Oxlint, which Harden runs to list and probe the files.
const PROJECT_RESOLUTIONS = {
  "adamantite/lint": "node_modules/adamantite/dist/presets/lint/core.js",
  "oxlint/package.json": "node_modules/oxlint/package.json",
}

// The lockfile of a project that init set up with nothing selected, so Doctor reports no missing
// lockfile.
const NO_SELECTION = {
  agents: false,
  ci: null,
  editors: [],
  presets: [],
  scripts: [],
  typescript: null,
} as const satisfies Selection

const INSTALLED = {
  ...ADAMANTITE_MODULE,
  ...makeLockfileFile(NO_SELECTION),
  "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }),
}

const CUSTOM_RULES_CONFIG = `import { defineConfig } from "oxlint"
import core from "adamantite/lint"
import custom from "adamantite/rules"

export default defineConfig({
  extends: [core, custom({ dir: "tooling/rules", name: "acme" })],
})
`

const CORE_CONFIG = `import { defineConfig } from "oxlint"
import core from "adamantite/lint"

export default defineConfig({
  extends: [core],
})
`

const MARKDOWN_FILE = /\.(?:md|mdx|mdc)$/u

/**
 * A `git` and an Oxlint entry that list the files of the test project, as `git ls-files -z` and
 * `oxlint --debug=files` print them. A `*.md` pathspec keeps only the Markdown files. Each lists
 * only the files inside the project, so the files of a parent folder stay out.
 */
interface ProcessOptions {
  readonly exitCode?: number
  /**
   * Files that the git index has and the working tree does not, as after a delete that is not
   * staged, or in a sparse checkout.
   */
  readonly indexOnlyFiles?: readonly string[]
  /**
   * What `git log -1 --format="%H %cs"` prints for each file that a commit changed, by its path
   * from the project root. Git prints nothing for another file.
   */
  readonly lastChanges?: Readonly<Record<string, string>>
  /**
   * Files that an ignore pattern of the Oxlint config matches, so `oxlint` does not list them.
   */
  readonly lintIgnoredFiles?: readonly string[]
  readonly oxlintExitCode?: number
  /**
   * What the Oxlint probe prints for the files that it parses. The process tests in
   * `src/lib/hardening/__tests__/suppressions.test.ts` run the probe.
   */
  readonly probeReport?: string
}

function makeHandle(exitCode: number, stdout: string) {
  return ChildProcessSpawner.makeHandle({
    all: Stream.empty,
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    pid: ChildProcessSpawner.ProcessId(1),
    stderr: Stream.empty,
    stdin: Sink.drain,
    stdout: Stream.make(new TextEncoder().encode(stdout)),
    unref: Effect.succeed(Effect.void),
  })
}

function makeProcessLayer(files: FileSystemTestContext, processes: ProcessOptions = {}) {
  const {
    exitCode = 0,
    indexOnlyFiles = [],
    lintIgnoredFiles = [],
    oxlintExitCode = 0,
    probeReport = '{ "diagnostics": [], "number_of_files": 0 }',
  } = processes

  const listFiles = () =>
    Array.sort(
      files.list().filter((file) => !file.startsWith("../")),
      Order.String
    )

  const getGitOutput = (args: ChildProcess.StandardCommand["args"]) =>
    args[0] === "log"
      ? (Object.entries(processes.lastChanges ?? {}).find(([file]) => args.at(-1) === file)?.[1]
        ?? "")
      : Array.sort([...listFiles(), ...indexOnlyFiles], Order.String)
          .filter((file) => !args.includes("*.md") || MARKDOWN_FILE.test(file))
          .map((file) => `${file}\0`)
          .join("")

  const getOxlintOutput = () =>
    listFiles()
      .filter((file) => !lintIgnoredFiles.includes(file))
      .map((file) => `${file}\n`)
      .join("")

  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner)(
    ChildProcessSpawner.make((command) => {
      if (ChildProcess.isStandardCommand(command) && command.command === "git") {
        return Effect.succeed(
          makeHandle(exitCode, exitCode === 0 ? getGitOutput(command.args) : "")
        )
      }

      if (
        ChildProcess.isStandardCommand(command)
        && command.command === OXLINT_COMMAND.command
        && command.args[0] === OXLINT_COMMAND.args[0]
        && command.args.includes("--debug=files")
      ) {
        return Effect.succeed(
          makeHandle(oxlintExitCode, oxlintExitCode === 0 ? getOxlintOutput() : "")
        )
      }

      if (
        ChildProcess.isStandardCommand(command)
        && command.command === OXLINT_COMMAND.command
        && command.args[0] === OXLINT_COMMAND.args[0]
        && command.args.includes("--disable-nested-config")
      ) {
        return Effect.succeed(makeHandle(0, probeReport))
      }

      return Effect.die(
        "Harden tests spawn only git, and oxlint to list the files or to probe them"
      )
    })
  )
}

function runHarden(
  files: Record<string, string>,
  args: readonly string[] = [],
  processes: ProcessOptions = {},
  links: Record<string, string> = {}
) {
  return Effect.gen(function* () {
    const logLines: unknown[] = []
    const context = createFileSystemTestContext({ files, links })

    const exit = yield* runCommand(hardenCommand, args, {
      files: context,
      // The monorepo configs import the shared tooling package.
      layers: [
        makeProcessLayer(context, processes),
        makeModuleResolverLayer(context.root, {
          "@acme/lint": "tooling/lint/index.ts",
          ...PROJECT_RESOLUTIONS,
        }),
      ],
      logLines,
    })

    return { exit, logLines: logLines.filter(Predicate.isString) }
  })
}

// Doctor finds no applicable integration in a project that has only the adamantite package, so
// the assessment after a session passes.
const HEALTHY_FILES = INSTALLED

// A project with a loaded custom rule. Verification cases do not stay in the project.
const CUSTOM_RULE_FILES = {
  ".adamantite/lint/no-foo.ts": "export default {}\n",
  "oxlint.config.ts": CUSTOM_RULES_CONFIG.replace(
    'dir: "tooling/rules", name: "acme"',
    'name: "acme"'
  ),
  ...INSTALLED,
}

const SUCCESS_LOG = "✔ Nothing remains to resolve after the Claude Code session."

// The lines that the check runs print after the session, with a blank line between the tools.
const CHECK_TITLES = [
  "✨ Checking formatting · adamantite (oxfmt)",
  "",
  "🔍 Linting · adamantite (oxlint)",
]

interface InteractiveHardenOptions {
  readonly args?: readonly string[]
  readonly files?: Record<string, string>
  /**
   * Called with the path of each file that Harden reads as text.
   */
  readonly onReadFile?: (path: string) => void
  /**
   * What the agent changes in the project during the session.
   */
  readonly onSession?: (files: FileSystemTestContext) => void
  /**
   * The keys that answer the prompts. The menu lists `Hand off to Claude Code`, `Hand off to
   * Codex`, `Copy the agent prompt`, and `Finish without an agent`, with the cursor on the first.
   */
  readonly keys: readonly TestKey[]
  /**
   * The modules that the project resolves. Defaults to `PROJECT_RESOLUTIONS`.
   */
  readonly resolutions?: Readonly<Record<string, string>>
  readonly runner?: Parameters<typeof makeHandoffRunner>[0]
}

function runInteractiveHarden(options: InteractiveHardenOptions) {
  return Effect.gen(function* () {
    const logLines: unknown[] = []
    const terminal = createTerminalTestContext(options.keys)
    const files = createFileSystemTestContext({ files: options.files ?? HEALTHY_FILES })

    const runner = makeHandoffRunner({
      ...options.runner,
      onAgentRun: () => options.onSession?.(files),
    })

    const fileSystem = Layer.effect(FileSystem.FileSystem)(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem

        return {
          ...fs,
          readFileString: (path: string, encoding?: string) => {
            options.onReadFile?.(path)

            return fs.readFileString(path, encoding)
          },
        }
      })
    ).pipe(Layer.provide(files.layer))

    const exit = yield* runCommand(hardenCommand, options.args ?? [], {
      files,
      layers: [
        fileSystem,
        runner.layer,
        promptingLayer,
        makeProcessLayer(files),
        makeModuleResolverLayer(files.root, options.resolutions ?? PROJECT_RESOLUTIONS),
      ],
      logLines,
      terminal,
    })

    return {
      copied: terminal.copied(),
      exit,
      logLines: logLines.filter(Predicate.isString),
      output: terminal.output(),
      runner,
    }
  })
}

// The project is a workspace package, and the package manager installs Adamantite in the parent
// folder.
function runHardenHoisted() {
  return Effect.gen(function* () {
    const logLines: unknown[] = []

    const files = {
      "../node_modules/adamantite/dist/presets/lint/core.js": "export default {}\n",
      "../node_modules/adamantite/package.json": yield* stringifyJson({
        name: "adamantite",
        version: getPackageVersion(),
      }),
      "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }),
    }

    const context = createFileSystemTestContext({ files })

    const exit = yield* runCommand(hardenCommand, [], {
      files: context,
      layers: [
        makeProcessLayer(context),
        makeModuleResolverLayer(context.root, {
          "adamantite/lint": "../node_modules/adamantite/dist/presets/lint/core.js",
          "oxlint/package.json": "node_modules/oxlint/package.json",
        }),
      ],
      logLines,
    })

    return { exit, logLines: logLines.filter(Predicate.isString) }
  })
}

function runHardenPrompt(
  files: Record<string, string>,
  args: readonly string[] = [],
  processes: ProcessOptions = {}
) {
  return Effect.gen(function* () {
    const { exit, logLines } = yield* runHarden(files, args, processes)

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(logLines).toHaveLength(1)

    return logLines[0] ?? ""
  })
}

// The root and `web` load the rules of a shared tooling package, and `api` has its own rules folder.
const MONOREPO_FILES = {
  ...ADAMANTITE_MODULE,
  ".changeset/add-web.md": '---\n"web": patch\n---\n',
  "AGENTS.md": "# AGENTS.md\n",
  "docs/architecture.md": "# Architecture\n",
  "oxlint.config.ts": `import { defineConfig } from "oxlint"
import tooling from "@acme/lint"

export default defineConfig({ extends: [tooling] })
`,
  "package.json": manifest({
    devDependencies: { adamantite: "1.0.0" },
    workspaces: ["packages/*", "tooling/lint"],
  }),
  "packages/api/README.md": "# api\n",
  "packages/api/oxlint.config.ts": CUSTOM_RULES_CONFIG.replace(
    'dir: "tooling/rules", name: "acme"',
    'dir: "rules", name: "api"'
  ),
  "packages/api/package.json": JSON.stringify({ name: "api" }),
  "packages/web/AGENTS.md": "# AGENTS.md\n",
  "packages/web/oxlint.config.ts": `import { defineConfig } from "oxlint"
import tooling from "@acme/lint"

export default defineConfig({ extends: [tooling] })
`,
  "packages/web/package.json": JSON.stringify({ name: "web" }),
  "packages/web/src/index.ts": "export {}\n",
  "tooling/lint/index.ts": `import custom from "adamantite/rules"

export default custom({ dir: "rules", name: "acme" })
`,
  "tooling/lint/package.json": JSON.stringify({ name: "@acme/lint" }),
}

function getContext(prompt: string) {
  return {
    configs: getListItems(getSection(prompt, "### Oxlint config")),
    documentationFiles: getListItems(getSection(prompt, "### Documentation")),
    instructionFiles: getListItems(getSection(prompt, "### Instructions")),
    rulesFolders: getListItems(getSection(prompt, "### Rules folders")),
  }
}

const decodeReport = Schema.decodeUnknownSync(Schema.fromJsonString(Report))
const { decisionsRecord: DecisionsRecord, fixHistory: FixHistory } = Report.fields

const RECORD = ProjectPath.make(".adamantite/decisions.md")
const RECORD_COMMIT = "4f0c1d2e3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d"

const RECORD_CONTENT =
  "# Decisions\n\n## Test files sit beside their module\n\n- Decision: rejected\n"

// A decisions record that commit `RECORD_COMMIT` last changed.
const RECORD_FILES = { [RECORD]: RECORD_CONTENT }

const RECORD_PROCESSES = { lastChanges: { [RECORD]: `${RECORD_COMMIT} 2026-11-02\n` } }

// What the Oxlint probe prints for `src/index.ts`, whose first line turns off `no-console`.
const INDEX_PROBE_REPORT = JSON.stringify({
  diagnostics: [
    {
      code: "adamantite-probe(comments)",
      filename: "src/index.ts",
      labels: [{ span: { column: 1, line: 1 } }],
      message: JSON.stringify({
        anchor: "start",
        comments: [{ line: 1, value: " oxlint-disable-next-line no-console" }],
        lines: 3,
      }),
    },
  ],
  number_of_files: 1,
})

describe("harden", () => {
  it.effect("print the harden context as JSON that decodes with the report schema", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden(
        {
          ...CUSTOM_RULE_FILES,
          "AGENTS.md": "Read [the guide](docs/missing.md).\n",
          "docs/unreached.md": "# Unreached\n",
          "src/index.ts": "// oxlint-disable-next-line no-console\nconsole.log(1)\n",
        },
        ["--json", "--commits", "20"],
        {
          probeReport: INDEX_PROBE_REPORT,
        }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(logLines).toHaveLength(1)
      expect(decodeReport(logLines[0])).toStrictEqual({
        agentReach: Option.some({
          brokenLinks: [{ file: "AGENTS.md", target: "docs/missing.md" }],
          unreached: ["docs/unreached.md"],
        }),
        configs: ["oxlint.config.ts"],
        decisionsRecord: DecisionsRecord.cases.Missing.make({ path: RECORD }),
        documentationFiles: Option.some(["AGENTS.md", "docs/unreached.md"]),
        fixHistory: FixHistory.cases.Last.make({ count: 20 }),
        instructionFiles: ["AGENTS.md"],
        overrides: new LintedOverrides({ rules: [] }),
        rulesFolders: [".adamantite/lint"],
        schemaVersion: 1,
        scope: null,
        suppressions: Option.some([
          { locations: ["src/index.ts:1"], rule: Option.some("no-console") },
        ]),
        unloadedConfigs: [],
      })
    })
  )

  it.effect("print the commit of the decisions record, and the fix history since it, as JSON", () =>
    Effect.gen(function* () {
      const { logLines } = yield* runHarden(
        { ...RECORD_FILES, ...INSTALLED },
        ["--json"],
        RECORD_PROCESSES
      )

      expect(decodeReport(logLines[0])).toMatchObject({
        decisionsRecord: DecisionsRecord.cases.Committed.make({
          commit: RECORD_COMMIT,
          date: "2026-11-02",
          path: RECORD,
        }),
        fixHistory: FixHistory.cases.Since.make({ commit: RECORD_COMMIT }),
      })
    })
  )

  it("give the fix history a number of commits or a start commit, and never both", () => {
    expectTypeOf<{ _tag: "Last"; count: number }>().toExtend<typeof FixHistory.Type>()
    expectTypeOf<{ _tag: "Since"; commit: string }>().toExtend<typeof FixHistory.Type>()
    expectTypeOf<{ _tag: "Last"; commit: string }>().not.toExtend<typeof FixHistory.Type>()
  })

  it.effect("open no menu and start no agent with --json in an interactive terminal", () =>
    Effect.gen(function* () {
      const { exit, logLines, output, runner } = yield* runInteractiveHarden({
        args: ["--json"],
        keys: [],
      })

      expect({
        invocations: runner.invocations,
        lines: logLines.length,
        output,
        succeeded: Exit.isSuccess(exit),
      }).toStrictEqual({ invocations: [], lines: 1, output: "", succeeded: true })
      expect(decodeReport(logLines[0]).schemaVersion).toBe(1)
    })
  )

  // Agent reach is a fact that Adamantite computes for the agent, so `--json` shows each case.
  it.effect.each<{
    readonly files: Readonly<Record<string, string>>
    readonly name: string
    readonly reach: AgentReach
  }>([
    {
      files: {
        "AGENTS.md": "Read `GLOSSARY.md` and [the architecture](docs/architecture.md#layers).\n",
        "GLOSSARY.md": "# Glossary\n",
        "docs/architecture.md": "See [the testing guide](./guides/testing.md).\n",
        "docs/guides/testing.md": "# Testing\n",
        "docs/plans/old.md": "# Old plan\n",
        "src/README.md": "# Source\n",
      },
      name: "reach the files that links and code spans name, also through other files",
      reach: { brokenLinks: [], unreached: ["docs/plans/old.md", "src/README.md"] },
    },
    {
      files: {
        ".cursor/rules/style.mdc": "See `docs/style.md`.\n",
        "CLAUDE.md": "See `docs/testing.md`.\n",
        "docs/style.md": "# Style\n",
        "docs/testing.md": "# Testing\n",
        "packages/web/AGENTS.md": "See [the web guide](docs/guide.md).\n",
        "packages/web/docs/guide.md": "# Web\n",
      },
      name: "start from each AGENTS.md, and not from the files of one vendor",
      reach: {
        brokenLinks: [],
        unreached: [".cursor/rules/style.mdc", "CLAUDE.md", "docs/style.md", "docs/testing.md"],
      },
    },
    {
      files: {
        "AGENTS.md": "Record decisions in `docs/adr`, and keep `src/lib` in layers.\n",
        "docs/adr/0001-use-adamantite.md": "# Use Adamantite\n",
        "docs/adr/0002-use-effect.md": "# Use Effect\n",
        "docs/plans/old.md": "# Old plan\n",
        "src/lib/hardening/prompt.md": "# Prompt\n",
      },
      name: "reach each Markdown file directly in a folder that a file names",
      reach: { brokenLinks: [], unreached: ["docs/plans/old.md", "src/lib/hardening/prompt.md"] },
    },
    {
      files: {
        "AGENTS.md":
          "Use [Effect](https://effect.website), see [below](#tests), install `@effect/vitest`, and run `pnpm run check`.\n",
        "docs/testing.md": "# Testing\n",
      },
      name: "ignore a URL, an anchor, a package name, and a code span that names no file",
      reach: { brokenLinks: [], unreached: ["docs/testing.md"] },
    },
    {
      // A code span can name a file that a step creates later, so only a link counts as broken.
      files: { "AGENTS.md": "Read [the guide](docs/guide.md), then `docs/missing-span.md`.\n" },
      name: "list a link to a Markdown file that does not exist",
      reach: { brokenLinks: [{ file: "AGENTS.md", target: "docs/guide.md" }], unreached: [] },
    },
    {
      // A fence with text after it cannot close a block, so the block ends on the third line.
      files: {
        "AGENTS.md":
          "```text\n```typescript\n```\n\nRead [the guide](docs/guide.md) and [the plan](docs/missing.md).\n",
        "docs/guide.md": "# Guide\n",
      },
      name: "read the links after a code block that shows a fence with a language",
      reach: { brokenLinks: [{ file: "AGENTS.md", target: "docs/missing.md" }], unreached: [] },
    },
    {
      files: {
        "AGENTS.md": [
          "Write a pointer like `[the guide](docs/example.md)`:",
          "",
          "```markdown",
          "Read [the guide](docs/fenced.md).",
          "```",
          "",
          "~~~",
          "[style]: docs/style.md",
          "~~~",
          "",
        ].join("\n"),
        "docs/style.md": "# Style\n",
      },
      name: "ignore the links of an example in a code block or in inline code",
      reach: { brokenLinks: [], unreached: ["docs/style.md"] },
    },
  ])("$name", ({ files, reach }) =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden({ ...INSTALLED, ...files }, ["--json"])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(decodeReport(logLines[0]).agentReach).toStrictEqual(Option.some(reach))
    })
  )

  // A coding agent finds the skills of its skill folder on its own, so harden lists none of them.
  it.effect("list no copy of the Adamantite skill in a project that init set up", () =>
    Effect.gen(function* () {
      const project = createFileSystemTestContext({
        files: {
          ".claude/settings.json": "{}\n",
          "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }),
        },
      })

      yield* runLifecycle("init", project, ["--non-interactive", "--script", "check", "--agents"])

      const { logLines } = yield* runHarden(
        {
          ...ADAMANTITE_MODULE,
          ...Object.fromEntries(project.list().map((file) => [file, project.read(file)])),
        },
        ["--json"]
      )

      const { agentReach, documentationFiles } = decodeReport(logLines[0])

      expect(project.list()).toContain(".claude/skills/adamantite/SKILL.md")
      expect(documentationFiles).toStrictEqual(Option.some(["AGENTS.md"]))
      expect(agentReach).toStrictEqual(Option.some({ brokenLinks: [], unreached: [] }))
    })
  )

  it.effect("print the prompt and succeed in a non-interactive terminal", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden({
        "oxlint.config.ts": CORE_CONFIG,
        ...INSTALLED,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(logLines.map(getHeadings)).toStrictEqual([
        [
          "# Adamantite harden",
          "## Context",
          "### Oxlint config",
          "### Rules folders",
          "### Instructions",
          "### Documentation",
          "### Agent reach",
          "### Decisions",
          "### Suppressions",
          "### Overrides that turn a rule off",
          "## 1. Explore the documentation",
          "## 2. List the written standards",
          "## 3. Survey the code",
          "## 4. Read the fix history",
          "## 5. Drop what a tool already enforces",
          "## 6. Find the gaps in the existing rules",
          "## 7. Place each candidate on the enforcement ladder",
          "## 8. Show the candidates and wait for approval",
          "## 9. Write the approved standards",
          "## Verify",
          "## Report the result",
          "## Check the result",
        ],
      ])
    })
  )

  it.effect("list the Oxlint config, its rules folder, and the instruction files that exist", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "AGENTS.md": "# AGENTS.md\n",
        "docs/adr/0001-use-adamantite.md": "# Use Adamantite\n",
        "oxlint.config.ts": CUSTOM_RULES_CONFIG,
        ...INSTALLED,
      })

      expect(getListItems(getSection(prompt, "### Oxlint config"))).toStrictEqual([
        "- `oxlint.config.ts`",
      ])
      expect(getListItems(getSection(prompt, "### Rules folders"))).toStrictEqual([
        "- `tooling/rules`",
      ])
      expect(getListItems(getSection(prompt, "### Instructions"))).toStrictEqual(["- `AGENTS.md`"])
    })
  )

  it.effect(
    "start the instructions from AGENTS.md, and list the other instruction files as docs",
    () =>
      Effect.gen(function* () {
        const prompt = yield* runHardenPrompt({
          ".cursor/rules/testing.mdc": "# Testing\n",
          "AGENTS.md": "# AGENTS.md\n",
          "CLAUDE.md": "@AGENTS.md\n",
          "CODING_STANDARDS.md": "# Coding standards\n",
          ...INSTALLED,
        })

        expect(getContext(prompt)).toMatchObject({
          documentationFiles: [
            "- `.cursor/rules/testing.mdc`",
            "- `AGENTS.md`",
            "- `CLAUDE.md`",
            "- `CODING_STANDARDS.md`",
          ],
          instructionFiles: ["- `AGENTS.md`"],
        })
      })
  )

  it.effect(
    "list each Markdown file that git lists, except changesets, changelogs, and skills",
    () =>
      Effect.gen(function* () {
        const prompt = yield* runHardenPrompt({
          ".agents/skills/review/SKILL.md": "# Review\n",
          ".changeset/add-cart.md": '---\n"acme": patch\n---\n',
          ".claude/skills/review/references/checks.md": "# Checks\n",
          "CHANGELOG.md": "# acme\n",
          "CONTRIBUTING.md": "# Contributing\n",
          "docs/guides/errors.mdx": "# Errors\n",
          "docs/skills/writing.md": "# Writing\n",
          "packages/cart/.grok/skills/review/SKILL.md": "# Review\n",
          "packages/cart/CHANGELOG.md": "# cart\n",
          "src/cart/README.md": "# Cart\n",
          ...INSTALLED,
        })

        // `docs/skills` is not a skill folder of an agent, so its files stay.
        expect(getListItems(getSection(prompt, "### Documentation"))).toStrictEqual([
          "- `CONTRIBUTING.md`",
          "- `docs/guides/errors.mdx`",
          "- `docs/skills/writing.md`",
          "- `src/cart/README.md`",
        ])
        expect(
          getMissingPhrases(getSection(prompt, "## 1. Explore the documentation"), [
            "read each file in the documentation list",
            "This step is done when each file in the documentation list, and each file that the instructions link to, has its mark.",
          ])
        ).toStrictEqual([])
      })
  )

  it.effect("leave out a file that the git index has and the working tree does not", () =>
    Effect.gen(function* () {
      const { logLines } = yield* runHarden(
        { "docs/current.md": "# Current\n", ...INSTALLED },
        [],
        {
          indexOnlyFiles: ["docs/removed.md"],
        }
      )

      expect(getListItems(getSection(logLines[0] ?? "", "### Documentation"))).toStrictEqual([
        "- `docs/current.md`",
      ])
    })
  )

  it.effect("list the files that no AGENTS.md reaches, and a broken link", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "AGENTS.md": "Read [the testing guide](docs/testing.md) and `docs/architecture.md`.\n",
        "CLAUDE.md": "See `docs/style.md`.\n",
        "docs/architecture.md": "# Architecture\n",
        "docs/style.md": "# Style\n",
        ...INSTALLED,
      })

      expect(getListItems(getSection(prompt, "### Agent reach"))).toStrictEqual([
        "- `CLAUDE.md`",
        "- `docs/style.md`",
        "- `AGENTS.md` links to `docs/testing.md`",
      ])
    })
  )

  it.effect("list a link to a file that the git index has and the working tree does not", () =>
    Effect.gen(function* () {
      const { logLines } = yield* runHarden(
        { "AGENTS.md": "Read [the guide](docs/guide.md).\n", ...INSTALLED },
        [],
        { indexOnlyFiles: ["docs/guide.md"] }
      )

      expect(getListItems(getSection(logLines[0] ?? "", "### Agent reach"))).toStrictEqual([
        "- `AGENTS.md` links to `docs/guide.md`",
      ])
    })
  )

  it.effect("say that each Markdown file is reached when no file is out of reach", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({ "AGENTS.md": "# Acme\n", ...INSTALLED })

      expect(getSection(prompt, "### Agent reach")).toContain(
        "Links and code spans from each `AGENTS.md` reach each Markdown file."
      )
    })
  )

  it.effect("tell the agent to find the Markdown files when git cannot list them", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden(
        { "docs/errors.md": "# Errors\n", ...INSTALLED },
        [],
        { exitCode: 128 }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(getSection(logLines[0] ?? "", "### Documentation")).toContain(
        "Git could not list project files."
      )
      expect(getSection(logLines[0] ?? "", "### Agent reach")).toContain(
        "Follow the links from each `AGENTS.md` and record the files you checked."
      )
    })
  )

  it.effect("tell the agent to count the disable comments when Oxlint cannot list its files", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden(
        { "oxlint.config.ts": CORE_CONFIG, ...INSTALLED },
        [],
        { oxlintExitCode: 1 }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(getSection(logLines[0] ?? "", "### Suppressions")).toContain(
        'Count them yourself, for example with `rg -n "(oxlint|eslint)-disable"`'
      )
    })
  )

  it.effect("tell the agent to count the disable comments when Oxlint cannot read them", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden(
        {
          "oxlint.config.ts": CORE_CONFIG,
          "src/index.ts": "// oxlint-disable-next-line no-console\nconsole.log(1)\n",
          ...INSTALLED,
        },
        [],
        { probeReport: "Failed to load JS plugin: dist/probe.js" }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(getSection(logLines[0] ?? "", "### Suppressions")).toContain(
        'Count them yourself, for example with `rg -n "(oxlint|eslint)-disable"`'
      )
    })
  )

  it.effect("say that no comment turns a rule off", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({ "oxlint.config.ts": CORE_CONFIG, ...INSTALLED })

      expect(getSection(prompt, "### Suppressions")).toContain(
        "No `oxlint-disable` or `eslint-disable` comment turns a rule off."
      )
      expect(getSection(prompt, "### Overrides that turn a rule off")).toContain(
        "No override in the Oxlint config turns a rule off for files that it names."
      )
    })
  )

  it.effect("mark the missing files and the globs of an override without a lint", () =>
    Effect.gen(function* () {
      // The test `git` dies on any other command, so the marks come without an Oxlint run.
      const prompt = yield* runHardenPrompt({
        "oxlint.config.ts": CORE_CONFIG.replace(
          "extends: [core],",
          'extends: [core],\n  overrides: [{ files: ["src/gone.ts", "**/*.test.ts"], rules: { "no-console": "off", "no-alert": "error" } }],'
        ),
        ...INSTALLED,
      })

      expect(getSection(prompt, "### Overrides that turn a rule off")).toContain(
        [
          "- `no-console` in `oxlint.config.ts`:",
          "  - `src/gone.ts`: does not exist",
          "  - `**/*.test.ts`: a glob, so Adamantite did not lint its files",
        ].join("\n")
      )
    })
  )

  it.effect("tell the agent to add custom() when no config loads a rules folder", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "oxlint.config.ts": CORE_CONFIG,
        ...INSTALLED,
      })

      const rulesFolders = getSection(prompt, "### Rules folders")

      expect(rulesFolders).toContain("adamantite/rules")
      expect(rulesFolders).toContain(".adamantite/lint")
      expect(getSection(prompt, "### Instructions")).toContain("No `AGENTS.md` was found.")
    })
  )

  it.effect("defer adamantite init to the approval when no Oxlint config exists", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt(INSTALLED)

      expect(
        getMissingPhrases(getSection(prompt, "### Oxlint config"), [
          "tell the user to run `adamantite init` before step 9",
        ])
      ).toStrictEqual([])
    })
  )

  it.effect("keep placeholder-like text in a detected path literal", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "oxlint.config.ts": CUSTOM_RULES_CONFIG.replace("tooling/rules", "rules/{{version}}"),
        ...INSTALLED,
      })

      expect(getListItems(getSection(prompt, "### Rules folders"))).toStrictEqual([
        "- `rules/{{version}}`",
      ])
    })
  )

  it.effect("point to the config when a custom() folder is not a string literal", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "oxlint.config.ts": CUSTOM_RULES_CONFIG.replace('dir: "tooling/rules"', "dir: rulesDir"),
        ...INSTALLED,
      })

      expect(getSection(prompt, "### Rules folders")).toContain("`oxlint.config.ts`")
    })
  )

  it.effect(
    "have the read-only phase, the exploration, the rule audit, the scores, the approval gate, the write steps, and the verification",
    () =>
      Effect.gen(function* () {
        const prompt = yield* runHardenPrompt({
          "oxlint.config.ts": CORE_CONFIG,
          ...INSTALLED,
        })

        const missing = Object.entries(REQUIRED_PHRASES).flatMap(([heading, phrases]) =>
          getMissingPhrases(getSection(prompt, heading), phrases).map(
            (phrase) => `${heading}: ${phrase}`
          )
        )

        expect(
          getMissingPhrases(prompt.slice(0, prompt.indexOf("\n## Context\n")), [
            "Steps 1 to 8 are read-only for the target project.",
            "The one exception is the decisions record, which you write after the user answers in step 8.",
          ])
        ).toStrictEqual([])
        expect(missing).toStrictEqual([])
      })
  )

  it.effect("tell the agent to read the last 200 commits of the project folder by default", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt(INSTALLED)

      expect(getSection(prompt, "## 4. Read the fix history")).toContain(
        '`git log -n 200 --no-merges --format="%h %s" -- .`'
      )
    })
  )

  it.effect("read the number of commits that --commits gives, in the folder of --path", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt(MONOREPO_FILES, [
        "--commits",
        "50",
        "--path",
        "packages/web",
      ])

      expect(getSection(prompt, "## 4. Read the fix history")).toContain(
        '`git log -n 50 --no-merges --format="%h %s" -- packages/web`'
      )
    })
  )

  it.effect("quote a --path folder that the shell would split or reject", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({ "src/(app)/page.ts": "export {}\n", ...INSTALLED }, [
        "--path",
        "src/(app)",
      ])

      expect(getSection(prompt, "## 4. Read the fix history")).toContain(
        `\`git log -n 200 --no-merges --format="%h %s" -- 'src/(app)'\``
      )
    })
  )

  it.effect(
    "name the decisions record and its last commit, and read the fix history since that commit",
    () =>
      Effect.gen(function* () {
        const prompt = yield* runHardenPrompt(
          { ...RECORD_FILES, ...INSTALLED },
          [],
          RECORD_PROCESSES
        )

        expect(
          getMissingPhrases(getSection(prompt, "### Decisions"), [
            "The decisions record is `.adamantite/decisions.md`.",
            `Commit \`${RECORD_COMMIT}\` last changed it, on 2026-11-02.`,
          ])
        ).toStrictEqual([])
        expect(
          getMissingPhrases(getSection(prompt, "## 4. Read the fix history"), [
            `\`git log ${RECORD_COMMIT}..HEAD --no-merges --format="%h %s" -- .\``,
            "When it lists no commit, record that the history has no commit after the record",
          ])
        ).toStrictEqual([])
        // The agent reads the record, so the prompt names it and does not repeat its entries.
        expect(prompt).not.toContain("Test files sit beside their module")
      })
  )

  it.effect("say that no decisions record exists, and that step 8 creates it", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt(INSTALLED)

      expect(
        getMissingPhrases(getSection(prompt, "### Decisions"), [
          "The decisions record is `.adamantite/decisions.md`.",
          "It does not exist yet. Step 8 creates it with the first entry.",
        ])
      ).toStrictEqual([])
    })
  )

  it.effect.each([
    { name: "git has no commit of the decisions record", processes: {} },
    { name: "git cannot read the history", processes: { exitCode: 128 } },
  ])("read the last 200 commits when $name", ({ processes }) =>
    Effect.gen(function* () {
      const { logLines } = yield* runHarden({ ...RECORD_FILES, ...INSTALLED }, [], processes)
      const prompt = logLines[0] ?? ""

      expect(getSection(prompt, "### Decisions")).toContain(
        "Git names no commit that changed it, because the record is not committed or git cannot read the history."
      )
      expect(getSection(prompt, "## 4. Read the fix history")).toContain(
        '`git log -n 200 --no-merges --format="%h %s" -- .`'
      )
    })
  )

  it.effect("read the number of commits that --commits gives, also with a decisions record", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt(
        { ...RECORD_FILES, ...INSTALLED },
        ["--commits", "50"],
        RECORD_PROCESSES
      )

      expect(getSection(prompt, "## 4. Read the fix history")).toContain(
        '`git log -n 50 --no-merges --format="%h %s" -- .`'
      )
    })
  )

  it.effect("keep one decisions record at the project root when --path selects a package", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt(
        { ...MONOREPO_FILES, ...RECORD_FILES, "packages/web/.adamantite/decisions.md": "# Web\n" },
        ["--path", "packages/web"],
        RECORD_PROCESSES
      )

      expect(getSection(prompt, "### Decisions")).toContain(
        "The decisions record is `.adamantite/decisions.md`."
      )
      expect(getSection(prompt, "## 4. Read the fix history")).toContain(
        `\`git log ${RECORD_COMMIT}..HEAD --no-merges --format="%h %s" -- packages/web\``
      )
    })
  )

  it.effect("leave the decisions record out of the documentation and the agent reach", () =>
    Effect.gen(function* () {
      const { logLines } = yield* runHarden(
        { ...RECORD_FILES, "AGENTS.md": "# Acme\n", ...INSTALLED },
        ["--json"],
        RECORD_PROCESSES
      )

      expect(decodeReport(logLines[0])).toMatchObject({
        agentReach: Option.some({ brokenLinks: [], unreached: [] }),
        documentationFiles: Option.some(["AGENTS.md"]),
      })
    })
  )

  it.effect("fail when --commits is not a positive number", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden(INSTALLED, ["--commits", "0"])

      // Effect prints the help of the command, and Harden prints nothing.
      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([expect.stringMatching(/^DESCRIPTION\n/u)])
    })
  )

  it.effect("fail when Adamantite is not installed", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden({ "package.json": manifest({}) })

      // The runtime boundary prints the error once, on standard error.
      expect({
        error: Option.getOrThrow(Exit.findErrorOption(exit)).message,
        logLines,
      }).toStrictEqual({
        error:
          "`adamantite` is not installed in this project. Install it before running `adamantite harden`.",
        logLines: [],
      })
    })
  )

  it.effect("fail when Adamantite is in package.json but not in node_modules", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden({
        "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }),
      })

      // The runtime boundary prints the error once, on standard error.
      expect({
        error: Option.getOrThrow(Exit.findErrorOption(exit)).message,
        logLines,
      }).toStrictEqual({
        error:
          "`adamantite` is in `package.json` but not in `node_modules`. Install the dependencies before running `adamantite harden`.",
        logLines: [],
      })
    })
  )

  it.effect("fail when node_modules holds another Adamantite version than the one that runs", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden({
        ...INSTALLED,
        "node_modules/adamantite/package.json": yield* stringifyJson({
          name: "adamantite",
          version: "0.0.1",
        }),
      })

      // The runtime boundary prints the error once, on standard error.
      expect({
        error: Option.getOrThrow(Exit.findErrorOption(exit)).message,
        logLines,
      }).toStrictEqual({
        error: `This project installs Adamantite 0.0.1, but this command is Adamantite ${getPackageVersion()}. Run the project's own Adamantite, such as \`pnpm exec adamantite harden\`, or install the dependencies again.`,
        logLines: [],
      })
    })
  )

  it.effect("print the prompt when the package manager hoists Adamantite to a parent folder", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHardenHoisted()

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(logLines[0]).toContain("# Adamantite harden")
    })
  )

  it.effect("print the prompt in the Adamantite repository, which does not depend on itself", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "package.json": yield* stringifyJson({ name: "adamantite", version: getPackageVersion() }),
      })

      expect(prompt).toContain("# Adamantite harden")
    })
  )

  it.effect("fail in an Adamantite checkout of another version than the one that runs", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden({
        "package.json": yield* stringifyJson({ name: "adamantite", version: "0.0.1" }),
      })

      // The runtime boundary prints the error once, on standard error.
      expect({
        error: Option.getOrThrow(Exit.findErrorOption(exit)).message,
        logLines,
      }).toStrictEqual({
        error: `This project installs Adamantite 0.0.1, but this command is Adamantite ${getPackageVersion()}. Run the project's own Adamantite, such as \`pnpm exec adamantite harden\`, or install the dependencies again.`,
        logLines: [],
      })
    })
  )

  it.effect("list each workspace package's config, and a shared rules folder once", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt(MONOREPO_FILES)

      expect(getContext(prompt)).toStrictEqual({
        configs: [
          "- `oxlint.config.ts`",
          "- `packages/api/oxlint.config.ts`",
          "- `packages/web/oxlint.config.ts`",
        ],
        documentationFiles: [
          "- `AGENTS.md`",
          "- `docs/architecture.md`",
          "- `packages/api/README.md`",
          "- `packages/web/AGENTS.md`",
        ],
        instructionFiles: ["- `AGENTS.md`", "- `packages/web/AGENTS.md`"],
        rulesFolders: ["- `packages/api/rules`", "- `tooling/lint/rules`"],
      })
      expect(getSection(prompt, "## Context")).toContain(
        "Adamantite found these files in the project and its workspace packages."
      )
    })
  )

  it.effect(
    "start the reach of --path from the AGENTS.md of the root and the selected package",
    () =>
      Effect.gen(function* () {
        // Only the `api` instructions link to the shared guide, and an agent in `web` does not read them.
        const files = {
          ...MONOREPO_FILES,
          "docs/shared.md": "# Shared\n",
          "packages/api/AGENTS.md": "Read [the shared guide](../../docs/shared.md).\n",
        }

        const scoped = yield* runHardenPrompt(files, ["--path", "packages/web"])
        const whole = yield* runHardenPrompt(files)

        expect(getListItems(getSection(scoped, "### Agent reach"))).toContain("- `docs/shared.md`")
        expect(getListItems(getSection(whole, "### Agent reach"))).not.toContain(
          "- `docs/shared.md`"
        )
      })
  )

  it.effect("start the reach of --path also from the AGENTS.md of a parent package", () =>
    Effect.gen(function* () {
      // `packages/web/admin` is a workspace package inside `web`, and an agent in it reads the
      // instructions of `web` too.
      const prompt = yield* runHardenPrompt(
        {
          ...MONOREPO_FILES,
          "docs/web.md": "# Web standards\n",
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0" },
            workspaces: ["packages/*", "packages/web/admin", "tooling/lint"],
          }),
          "packages/web/AGENTS.md": "Read [the web standards](../../docs/web.md).\n",
          "packages/web/admin/package.json": yield* stringifyJson({ name: "admin" }),
        },
        ["--path", "packages/web/admin"]
      )

      expect(getListItems(getSection(prompt, "### Agent reach"))).not.toContain("- `docs/web.md`")
    })
  )

  it.effect.each([
    { args: ["--path", "packages/web"], name: "a workspace package" },
    { args: ["--path", "packages/web/src"], name: "a folder inside a workspace package" },
  ])("limit the context to $name with --path", ({ args }) =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt(MONOREPO_FILES, args)

      // The root instructions and docs apply to every package, and the rules of `web` live in
      // tooling.
      expect(getContext(prompt)).toStrictEqual({
        configs: ["- `packages/web/oxlint.config.ts`"],
        documentationFiles: [
          "- `AGENTS.md`",
          "- `docs/architecture.md`",
          "- `packages/web/AGENTS.md`",
        ],
        instructionFiles: ["- `AGENTS.md`", "- `packages/web/AGENTS.md`"],
        rulesFolders: ["- `tooling/lint/rules`"],
      })
      expect(getSection(prompt, "## Context")).toContain(
        `Adamantite found these files for \`${args[1]}\`, the folder that \`--path\` selects.`
      )
    })
  )

  it.effect.each([
    { args: ["--path", "packages/web"], name: "a workspace package" },
    { args: ["--path", "packages/web/src"], name: "a folder inside a workspace package" },
  ])("list the root config with --path for $name without a config of its own", ({ args }) =>
    Effect.gen(function* () {
      const { "packages/web/oxlint.config.ts": _, ...files } = MONOREPO_FILES
      const prompt = yield* runHardenPrompt(files, args)

      // Oxlint lints `web` with the nearest config, which is the root config. `api` stays out.
      expect(getContext(prompt)).toStrictEqual({
        configs: ["- `oxlint.config.ts`"],
        documentationFiles: [
          "- `AGENTS.md`",
          "- `docs/architecture.md`",
          "- `packages/web/AGENTS.md`",
        ],
        instructionFiles: ["- `AGENTS.md`", "- `packages/web/AGENTS.md`"],
        rulesFolders: ["- `tooling/lint/rules`"],
      })
    })
  )

  it.effect("fail with a clear message when --path is outside the project", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden(MONOREPO_FILES, ["--path", ".."])

      // The runtime boundary prints the error once, on standard error.
      expect({
        error: Option.getOrThrow(Exit.findErrorOption(exit)).message,
        logLines,
      }).toStrictEqual({
        error: expect.stringMatching(
          /^`--path` must be a folder inside the project\. `.+` is outside `.+`\.$/u
        ),
        logLines: [],
      })
    })
  )

  // `/var` is a symlink to `/private/var` on macOS, and the current directory is the real path.
  it.effect("accept --path through a directory symlink to a folder inside the project", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runHarden(
        MONOREPO_FILES,
        ["--path", "/link/packages/web"],
        {},
        { "/link": "." }
      )

      const direct = yield* runHardenPrompt(MONOREPO_FILES, ["--path", "packages/web"])

      expect(logLines).toStrictEqual([direct])
      expect(Exit.isSuccess(exit)).toBe(true)
    })
  )

  it.effect("offer a handoff to each installed agent, the copy, and nothing", () =>
    Effect.gen(function* () {
      const { exit, logLines, output, runner } = yield* runInteractiveHarden({
        files: CUSTOM_RULE_FILES,
        keys: ["down", "down", "down", "enter"],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(nonProbeInvocations(runner)).toStrictEqual([])
      expect(output).toContain(
        "? How do you want to harden this project? › \n❯ Hand off to Claude Code \n  Hand off to Codex \n  Copy the agent prompt \n  Finish without an agent "
      )
      expect(output).toContain(
        "✔ How do you want to harden this project? …  Finish without an agent"
      )
      expect(logLines).toStrictEqual([
        "💠 adamantite harden",
        "Harden ended without an agent session.",
      ])
    })
  )

  it.effect("hand off to an agent seeded with the prompt, then verify with check and Doctor", () =>
    Effect.gen(function* () {
      // The agent's exit code does not decide the result, and a session may change no files.
      const { exit, logLines, runner } = yield* runInteractiveHarden({
        files: CUSTOM_RULE_FILES,
        keys: ["enter"],
        runner: { agentExit: 1 },
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(nonProbeInvocations(runner)).toStrictEqual([
        expect.objectContaining({
          args: [expect.stringMatching(/^# Adamantite harden\n[\s\S]*## Verify/)],
          command: "claude",
          stderr: "inherit",
          stdin: "inherit",
          stdout: "inherit",
        }),
        expect.objectContaining({ args: ["--check"], command: "oxfmt" }),
        expect.objectContaining({
          ...OXLINT_COMMAND,
          args: [...OXLINT_COMMAND.args, "--deny-warnings"],
        }),
      ])
      expect(logLines).toStrictEqual([
        "💠 adamantite harden",
        "● Handing the terminal to Claude Code. Exit the agent to return to Harden.",
        ...CHECK_TITLES,
        SUCCESS_LOG,
        "✅ Harden checks passed.",
      ])
    })
  )

  it.effect(
    "read the workspace and discover the custom rules one time before and one time after the session",
    () =>
      Effect.gen(function* () {
        const { root } = createFileSystemTestContext()
        const counts = { configLoads: 0, workspaceReads: 0 }
        let beforeSession = { ...counts }

        yield* runInteractiveHarden({
          files: {
            ...CUSTOM_RULE_FILES,
            "packages/web/package.json": yield* stringifyJson({ name: "web" }),
            "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
          },
          keys: ["enter"],
          onReadFile: (path) => {
            if (path === `${root}/oxlint.config.ts`) {
              counts.configLoads += 1
            }

            if (path === `${root}/pnpm-workspace.yaml`) {
              counts.workspaceReads += 1
            }
          },
          onSession: () => {
            beforeSession = { ...counts }
          },
        })

        // Before the session, custom rule discovery and the overrides load the root config, and the
        // suppression count reads it as a source file. After it, the custom rule discovery of the
        // project loads it again.
        expect({ afterSession: counts, beforeSession }).toStrictEqual({
          afterSession: { configLoads: 4, workspaceReads: 2 },
          beforeSession: { configLoads: 3, workspaceReads: 1 },
        })
      })
  )

  it.effect("verify a project that has no custom rules", () =>
    Effect.gen(function* () {
      const { exit, logLines, runner } = yield* runInteractiveHarden({ keys: ["enter"] })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(
        nonProbeInvocations(runner).map((invocation) => invocation.name ?? invocation.command)
      ).toStrictEqual(["claude", "oxfmt", "oxlint"])
      expect(logLines.slice(-2)).toStrictEqual([SUCCESS_LOG, "✅ Harden checks passed."])
    })
  )

  it.effect("pass the verification of a session that writes only the decisions record", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runInteractiveHarden({
        keys: ["enter"],
        onSession: (files) => {
          files.write(RECORD, RECORD_CONTENT)
        },
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(logLines.slice(-2)).toStrictEqual([SUCCESS_LOG, "✅ Harden checks passed."])
    })
  )

  it.effect("fail and say so when check fails after the session", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runInteractiveHarden({
        keys: ["enter"],
        runner: { commandExits: { oxlint: 1 } },
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        "💠 adamantite harden",
        "● Handing the terminal to Claude Code. Exit the agent to return to Harden.",
        ...CHECK_TITLES,
        "✖ `adamantite check` failed.",
        "⚠️ Harden found issues.",
      ])
    })
  )

  it.effect("fail and name the missing tool when check cannot start after the session", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runInteractiveHarden({
        keys: ["enter"],
        runner: { commandExits: { oxfmt: "not-found" } },
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        "💠 adamantite harden",
        "● Handing the terminal to Claude Code. Exit the agent to return to Harden.",
        ...CHECK_TITLES,
        "✖ The command `oxfmt` was not found on PATH. Install it, then run the command again.",
        "✖ `adamantite check` failed.",
        "⚠️ Harden found issues.",
      ])
    })
  )

  // The CLI finds the Oxlint runtime before it starts Oxlint, so a missing Oxlint fails check with
  // an error and no Oxlint output. Harden still runs Doctor and reports both.
  it.effect(
    "name the repair and still run Doctor when check cannot find Oxlint after the session",
    () =>
      Effect.gen(function* () {
        const { exit, logLines } = yield* runInteractiveHarden({
          // Knip is installed without its managed config, so Doctor reports one finding.
          files: {
            ...ADAMANTITE_MODULE,
            ...makeLockfileFile({ ...NO_SELECTION, agents: true, scripts: ["analyze"] }),
            ...SKILL_FILES,
            "AGENTS.md": "# AGENTS.md\n\n<!-- ADAMANTITE:START -->\n<!-- ADAMANTITE:END -->\n",
            "package.json": manifest({
              devDependencies: { adamantite: "1.0.0", knip: knip.version },
              scripts: { analyze: "adamantite analyze" },
            }),
          },
          keys: ["enter", "n"],
          resolutions: { "adamantite/lint": PROJECT_RESOLUTIONS["adamantite/lint"] },
        })

        expect(Exit.isFailure(exit)).toBe(true)
        expect(logLines).toStrictEqual([
          "💠 adamantite harden",
          "● Handing the terminal to Claude Code. Exit the agent to return to Harden.",
          "✨ Checking formatting · adamantite (oxfmt)",
          "✖ The lockfile selects no script that runs `oxlint`, so `oxlint` is not installed. Run `adamantite init --non-interactive --script check` to add the script and install it.",
          "✖ `adamantite check` failed.",
          "▲ 1 finding remains after the Claude Code session.",
          expect.stringMatching(/^\n1\. Missing knip configuration\n {2}Current state\n/u),
          "⚠️ Harden found issues.",
        ])
      })
  )

  it.effect("fail and show the findings when Doctor finds issues after the session", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runInteractiveHarden({
        // Knip is installed without its managed config, so Doctor reports one finding.
        files: {
          ...ADAMANTITE_MODULE,
          ...makeLockfileFile({ ...NO_SELECTION, agents: true, scripts: ["analyze"] }),
          ...SKILL_FILES,
          "AGENTS.md": "# AGENTS.md\n\n<!-- ADAMANTITE:START -->\n<!-- ADAMANTITE:END -->\n",
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
        keys: ["enter", "n"],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        "💠 adamantite harden",
        "● Handing the terminal to Claude Code. Exit the agent to return to Harden.",
        ...CHECK_TITLES,
        "▲ 1 finding remains after the Claude Code session.",
        expect.stringMatching(/^\n1\. Missing knip configuration\n {2}Current state\n/u),
        "⚠️ Harden found issues.",
      ])
    })
  )

  it.effect("show the Doctor warnings and still pass when Doctor finds no issues", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runInteractiveHarden({
        // Doctor cannot load a config that names an undefined variable, so it warns without a finding.
        files: {
          "oxlint.config.ts": CUSTOM_RULES_CONFIG.replace('dir: "tooling/rules"', "dir: rulesDir"),
          ...INSTALLED,
        },
        keys: ["enter"],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        "💠 adamantite harden",
        "● Handing the terminal to Claude Code. Exit the agent to return to Harden.",
        ...CHECK_TITLES,
        "▲ Doctor cannot load `oxlint.config.ts`, so it does not check the `custom()` calls and rules folders behind it. Node.js reported: rulesDir is not defined",
        SUCCESS_LOG,
        "✅ Harden checks passed.",
      ])
    })
  )

  it.effect("fail and name the link when the session adds a link to a missing file", () =>
    Effect.gen(function* () {
      const { exit, logLines } = yield* runInteractiveHarden({
        // The broken link that the project had before the session does not fail it.
        files: { "AGENTS.md": "Read [the old guide](docs/old.md).\n", ...HEALTHY_FILES },
        keys: ["enter"],
        onSession: (files) => {
          files.write("AGENTS.md", `${files.read("AGENTS.md")}Read [the style](docs/style.md).\n`)
        },
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        "💠 adamantite harden",
        "● Handing the terminal to Claude Code. Exit the agent to return to Harden.",
        ...CHECK_TITLES,
        "✖ `AGENTS.md` links to `docs/style.md`, which does not exist.",
        "⚠️ Harden found issues.",
      ])
    })
  )

  it.effect("fail without side effects when the user cancels the menu", () =>
    Effect.gen(function* () {
      const { copied, exit, logLines, runner } = yield* runInteractiveHarden({ keys: ["ctrl+c"] })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toStrictEqual(
        new CommandFailed({ command: "harden", exitCode: ChildProcessSpawner.ExitCode(1) })
      )
      expect(logLines).toStrictEqual(["💠 adamantite harden", "\n■ Harden was cancelled."])
      expect(nonProbeInvocations(runner)).toStrictEqual([])
      expect(copied).toStrictEqual([])
    })
  )

  it.effect("fail when Adamantite is not installed in an interactive terminal", () =>
    Effect.gen(function* () {
      const logLines: unknown[] = []

      const exit = yield* runCommand(hardenCommand, [], {
        files: createFileSystemTestContext({ files: { "package.json": manifest({}) } }),
        layers: [promptingLayer],
        logLines,
      })

      expect({
        error: Option.getOrThrow(Exit.findErrorOption(exit)).message,
        logLines,
      }).toStrictEqual({
        error:
          "`adamantite` is not installed in this project. Install it before running `adamantite harden`.",
        logLines: ["💠 adamantite harden"],
      })
    })
  )
})
