import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import hardenCommand from "#commands/harden.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import {
  agentByCommand,
  createPrompterTestContext,
  makeHandoffRunner,
  interactiveTerminalLayer,
  nonProbeInvocations,
  runCommand,
} from "./command-test-helpers.ts"

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
    "the files that the instructions link to or tell agents to read",
    "**discovery gap**",
    "This step is done when each documentation file has its mark.",
  ],
  "## 2. List the written standards": [
    "Each written standard is a candidate, and goes on to step 4",
  ],
  "## 3. Survey the code": [
    "the command that gives the count",
    "A construct that the code never uses is not a standard by itself.",
    "A rule that a commit removed is a **decision**",
    "This step is done when each area has its candidates",
  ],
  "## 4. Drop what a tool already enforces": [
    "For each written standard from step 2 and each candidate from step 3",
    "lint a counterexample from step 3 where it is",
    "make a **trial copy** outside the project",
    "The project itself stays unchanged.",
    "A trial is valid only when the rule reports the first file at the severity that you set, and accepts the second.",
    "A report from a rule that only the trial turns on is not enforcement",
    "When a tool enforces only part of a written standard, keep the other part as a candidate.",
  ],
  "## 5. Place each candidate on the enforcement ladder": [
    "A native rule, such as a file-name rule, comes before a custom rule",
    "Write one combined `no-restricted-imports` for each set of files",
    "**Project check:**",
    "one case that the rule must report and one similar case that it must accept",
    "Say what the rule guarantees and what it does not",
    "is a decision, not a candidate",
  ],
  "## 6. Show the candidates and wait for approval": [
    "Score each candidate from 1 to 5",
    "Show the candidates with a score of 4 or 5, from the highest score to the lowest.",
    "**Decisions:**",
    "**Discovery gaps:**",
    "**Also considered:**",
    "This step is done when the user names the candidates to write",
    "When no human can approve",
    "Stop after this step.",
  ],
  "## 7. Write the approved standards": [
    "`adamantite rule add <name>`",
    'the "Custom rules" section of the Adamantite skill',
    "pass it with `--dir`",
    "states the standard and why it exists",
    "delete the instruction of each standard that a rule now checks",
    "keep the other part as the instruction",
    "keep the code that a new rule reports as it is",
    "turns the rule off only in the files that break it now",
    "Do not set the rule to `warn`: `adamantite check` fails on warnings.",
    "`CODING_STANDARDS.md`",
    "add each approved pointer to the instruction file that the gap names",
  ],
  "## Verify": [
    "`adamantite check`, `adamantite rule test`, and `adamantite doctor`",
    "All three must exit 0.",
    "When you changed a project check, also run that check with the project's own command",
    "add the file to the override as step 7 says, not a disable comment",
    "When `rule test` fails, fix the rule. Change a test case only when the case itself is wrong",
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
const ADAMANTITE_RESOLUTION = {
  "adamantite/lint": "node_modules/adamantite/dist/presets/lint/core.js",
}

const INSTALLED = {
  ...ADAMANTITE_MODULE,
  "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }),
}

const CUSTOM_RULES_CONFIG = `import { defineConfig } from "oxlint"
import core from "adamantite/lint"
import custom from "adamantite/lint/custom"

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

function runHarden(files: Record<string, string>, args: readonly string[] = []) {
  return Effect.gen(function* () {
    const prompter = createPrompterTestContext()
    const context = createFileSystemTestContext({ files })
    const exit = yield* runCommand(hardenCommand, args, {
      files: context,
      // The monorepo configs import the shared tooling package.
      layers: [
        prompter.layer,
        makeModuleResolverLayer(context.root, {
          "@acme/lint": "tooling/lint/index.ts",
          ...ADAMANTITE_RESOLUTION,
        }),
      ],
    })

    return { exit, prompter }
  })
}

const claudeAgent = agentByCommand("claude")

// Doctor finds no applicable integration in a project that has only the adamantite package, so
// the assessment after a session passes.
const HEALTHY_FILES = INSTALLED

// A config that loads `.adamantite/rules`, with one rule test, so `rule test` has a test to run.
const RULE_TEST_FILES = {
  ".adamantite/rules/no-foo.ts": "export default {}\n",
  ".adamantite/rules/tests/no-foo.ts": "// test\n",
  "oxlint.config.ts": CUSTOM_RULES_CONFIG.replace(
    'dir: "tooling/rules", name: "acme"',
    'name: "acme"'
  ),
  ...INSTALLED,
}

const SUCCESS_LOG = {
  level: "success",
  message:
    "`adamantite check`, `adamantite rule test`, and Doctor pass after the Claude Code session.",
}

interface InteractiveHardenOptions {
  readonly files?: Record<string, string>
  readonly prompter?: Parameters<typeof createPrompterTestContext>[0]
  readonly runner?: Parameters<typeof makeHandoffRunner>[0]
}

function runInteractiveHarden(options: InteractiveHardenOptions) {
  return Effect.gen(function* () {
    const copied: string[] = []
    const prompter = createPrompterTestContext(options.prompter)
    const runner = makeHandoffRunner(options.runner)
    const terminal = Layer.succeed(TerminalCapabilities)({
      copyToClipboard: (content) => Effect.sync(() => copied.push(content)),
      isInteractive: Effect.succeed(true),
    })
    const files = createFileSystemTestContext({ files: options.files ?? HEALTHY_FILES })
    const exit = yield* runCommand(hardenCommand, [], {
      files,
      layers: [
        prompter.layer,
        runner.layer,
        terminal,
        makeModuleResolverLayer(files.root, ADAMANTITE_RESOLUTION),
      ],
    })

    return { copied, exit, prompter, runner }
  })
}

// The project is a workspace package, and the package manager installs Adamantite in the parent
// folder.
function runHardenHoisted() {
  return Effect.gen(function* () {
    const prompter = createPrompterTestContext()
    const context = createFileSystemTestContext({
      files: {
        "../node_modules/adamantite/dist/presets/lint/core.js": "export default {}\n",
        "../node_modules/adamantite/package.json": JSON.stringify({
          name: "adamantite",
          version: getPackageVersion(),
        }),
        "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }),
      },
    })
    const exit = yield* runCommand(hardenCommand, [], {
      files: context,
      layers: [
        prompter.layer,
        makeModuleResolverLayer(context.root, {
          "adamantite/lint": "../node_modules/adamantite/dist/presets/lint/core.js",
        }),
      ],
    })

    return { exit, prompter }
  })
}

function runHardenPrompt(files: Record<string, string>, args: readonly string[] = []) {
  return Effect.gen(function* () {
    const { exit, prompter } = yield* runHarden(files, args)

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(prompter.messages).toHaveLength(1)

    return prompter.messages[0] ?? ""
  })
}

// The root and `web` load the rules of a shared tooling package, and `api` has its own rules folder.
const MONOREPO_FILES = {
  ...ADAMANTITE_MODULE,
  "AGENTS.md": "# AGENTS.md\n",
  "oxlint.config.ts": `import { defineConfig } from "oxlint"
import tooling from "@acme/lint"

export default defineConfig({ extends: [tooling] })
`,
  "package.json": manifest({
    devDependencies: { adamantite: "1.0.0" },
    workspaces: ["packages/*", "tooling/lint"],
  }),
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
  "tooling/lint/index.ts": `import custom from "adamantite/lint/custom"

export default custom({ dir: "rules", name: "acme" })
`,
  "tooling/lint/package.json": JSON.stringify({ name: "@acme/lint" }),
}

function getContext(prompt: string) {
  return {
    configs: getListItems(getSection(prompt, "### Oxlint config")),
    instructionFiles: getListItems(getSection(prompt, "### Instructions")),
    rulesFolders: getListItems(getSection(prompt, "### Rules folders")),
  }
}

describe("harden", () => {
  it.effect("print the prompt and succeed in a non-interactive terminal", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runHarden({
        "oxlint.config.ts": CORE_CONFIG,
        ...INSTALLED,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.messages.map(getHeadings)).toStrictEqual([
        [
          "# Adamantite harden",
          "## Context",
          "### Oxlint config",
          "### Rules folders",
          "### Instructions",
          "## 1. Explore the documentation",
          "## 2. List the written standards",
          "## 3. Survey the code",
          "## 4. Drop what a tool already enforces",
          "## 5. Place each candidate on the enforcement ladder",
          "## 6. Show the candidates and wait for approval",
          "## 7. Write the approved standards",
          "## Verify",
        ],
      ])
      expect(prompter).toMatchObject({ intros: [], logs: [], notes: [], outros: [] })
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
      expect(getListItems(getSection(prompt, "### Instructions"))).toStrictEqual([
        "- `AGENTS.md`",
        "- `docs/adr`",
      ])
    })
  )

  it.effect("tell the agent to add custom() when no config loads a rules folder", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "oxlint.config.ts": CORE_CONFIG,
        ...INSTALLED,
      })
      const rulesFolders = getSection(prompt, "### Rules folders")

      expect(rulesFolders).toContain("adamantite/lint/custom")
      expect(rulesFolders).toContain(".adamantite/rules")
      expect(getSection(prompt, "### Instructions")).toContain("No instruction file was found.")
    })
  )

  it.effect("defer adamantite init to the approval when no Oxlint config exists", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt(INSTALLED)

      expect(
        getMissingPhrases(getSection(prompt, "### Oxlint config"), [
          "tell the user to run `adamantite init` before step 7",
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
    "have the read-only phase, the exploration, the scores, the approval gate, the write steps, and the verification",
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

        expect(prompt.slice(0, prompt.indexOf("\n## Context\n"))).toContain(
          "Steps 1 to 6 are read-only."
        )
        expect(missing).toStrictEqual([])
      })
  )

  it.effect("fail when Adamantite is not installed", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runHarden({ "package.json": manifest({}) })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.messages).toStrictEqual([
        "`adamantite` is not installed in this project. Install it before running `adamantite harden`.",
      ])
    })
  )

  it.effect("fail when Adamantite is in package.json but not in node_modules", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runHarden({
        "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }),
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.messages).toStrictEqual([
        "`adamantite` is in `package.json` but not in `node_modules`. Install the dependencies before running `adamantite harden`.",
      ])
    })
  )

  it.effect("fail when node_modules holds another Adamantite version than the one that runs", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runHarden({
        ...INSTALLED,
        "node_modules/adamantite/package.json": JSON.stringify({
          name: "adamantite",
          version: "0.0.1",
        }),
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.messages).toStrictEqual([
        `This project installs Adamantite 0.0.1, but this command is Adamantite ${getPackageVersion()}. Run the project's own Adamantite, such as \`pnpm exec adamantite harden\`, or install the dependencies again.`,
      ])
    })
  )

  it.effect("print the prompt when the package manager hoists Adamantite to a parent folder", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runHardenHoisted()

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.messages[0]).toContain("# Adamantite harden")
    })
  )

  it.effect("print the prompt in the Adamantite repository, which does not depend on itself", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "package.json": JSON.stringify({ name: "adamantite", version: getPackageVersion() }),
      })

      expect(prompt).toContain("# Adamantite harden")
    })
  )

  it.effect("fail in an Adamantite checkout of another version than the one that runs", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runHarden({
        "package.json": JSON.stringify({ name: "adamantite", version: "0.0.1" }),
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.messages).toStrictEqual([
        `This project installs Adamantite 0.0.1, but this command is Adamantite ${getPackageVersion()}. Run the project's own Adamantite, such as \`pnpm exec adamantite harden\`, or install the dependencies again.`,
      ])
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
        instructionFiles: ["- `AGENTS.md`", "- `packages/web/AGENTS.md`"],
        rulesFolders: ["- `packages/api/rules`", "- `tooling/lint/rules`"],
      })
      expect(getSection(prompt, "## Context")).toContain(
        "Adamantite found these files in the project and its workspace packages."
      )
    })
  )

  it.effect.each([
    { args: ["--path", "packages/web"], name: "a workspace package" },
    { args: ["--path", "packages/web/src"], name: "a folder inside a workspace package" },
  ])("limit the context to $name with --path", ({ args }) =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt(MONOREPO_FILES, args)

      // The root instructions apply to every package, and the rules of `web` live in tooling.
      expect(getContext(prompt)).toStrictEqual({
        configs: ["- `packages/web/oxlint.config.ts`"],
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
        instructionFiles: ["- `AGENTS.md`", "- `packages/web/AGENTS.md`"],
        rulesFolders: ["- `tooling/lint/rules`"],
      })
    })
  )

  it.effect("fail with a clear message when --path is outside the project", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runHarden(MONOREPO_FILES, ["--path", ".."])

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.messages).toStrictEqual([
        expect.stringMatching(
          /^`--path` must be a folder inside the project\. `.+` is outside `.+`\.$/u
        ),
      ])
    })
  )

  it.effect("offer a handoff to each installed agent, the copy, and nothing", () =>
    Effect.gen(function* () {
      const { exit, prompter, runner } = yield* runInteractiveHarden({
        files: RULE_TEST_FILES,
        prompter: { selectResponses: ["done"] },
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(nonProbeInvocations(runner)).toStrictEqual([])
      expect(prompter).toMatchObject({
        intros: ["💠 adamantite harden"],
        messages: [],
        outros: ["✅ Harden completed."],
        selectCalls: [
          {
            message: "How do you want to harden this project?",
            options: [
              expect.objectContaining({ label: "Hand off to Claude Code" }),
              expect.objectContaining({ label: "Hand off to Codex" }),
              expect.objectContaining({
                label: "Copy the Markdown prompt for a coding agent",
                value: "copy",
              }),
              expect.objectContaining({ label: "Do nothing", value: "done" }),
            ],
          },
        ],
      })
    })
  )

  it.effect(
    "hand off to an agent seeded with the prompt, then verify with check, rule test, and Doctor",
    () =>
      Effect.gen(function* () {
        // The agent's exit code does not decide the result, and a session may change no files.
        const { exit, prompter, runner } = yield* runInteractiveHarden({
          files: RULE_TEST_FILES,
          prompter: { selectResponses: [claudeAgent] },
          runner: { agentExit: 1 },
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(nonProbeInvocations(runner)).toStrictEqual([
          expect.objectContaining({
            args: [expect.stringMatching(/^# Adamantite harden\n[\s\S]*## Verify/)],
            command: "claude",
            detached: false,
            stderr: "inherit",
            stdin: "inherit",
            stdout: "inherit",
          }),
          expect.objectContaining({ args: ["--check"], command: "oxfmt" }),
          expect.objectContaining({ args: ["--deny-warnings"], command: "oxlint" }),
          {
            args: ["--test", ".adamantite/rules/tests/no-foo.ts"],
            command: "node",
            title: "🧪 Testing custom rules",
          },
        ])
        expect(prompter).toMatchObject({
          logs: [
            {
              level: "info",
              message: "Handing the terminal to Claude Code. Exit the agent to return to Harden.",
            },
            SUCCESS_LOG,
          ],
          outros: ["✅ Harden completed successfully!"],
        })
      })
  )

  it.effect("run no rule test and still pass when the project has no rule tests", () =>
    Effect.gen(function* () {
      const { exit, prompter, runner } = yield* runInteractiveHarden({
        prompter: { selectResponses: [claudeAgent] },
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(nonProbeInvocations(runner).map((invocation) => invocation.command)).toStrictEqual([
        "claude",
        "oxfmt",
        "oxlint",
      ])
      expect(prompter.logs).toContainEqual(SUCCESS_LOG)
      expect(prompter.outros).toStrictEqual(["✅ Harden completed successfully!"])
    })
  )

  it.effect("fail and say so when a rule test fails after the session", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runInteractiveHarden({
        files: RULE_TEST_FILES,
        prompter: { selectResponses: [claudeAgent] },
        runner: { commandExits: { node: 1 } },
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs.filter((log) => log.level !== "info")).toStrictEqual([
        {
          level: "error",
          message: "`adamantite rule test` failed after the Claude Code session.",
        },
      ])
      expect(prompter.outros).toStrictEqual(["⚠️ Harden verification failed."])
    })
  )

  it.effect("run the rule tests and name both steps when check also fails", () =>
    Effect.gen(function* () {
      const { exit, prompter, runner } = yield* runInteractiveHarden({
        files: RULE_TEST_FILES,
        prompter: { selectResponses: [claudeAgent] },
        runner: { commandExits: { node: 1, oxlint: 1 } },
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(nonProbeInvocations(runner).map((invocation) => invocation.command)).toStrictEqual([
        "claude",
        "oxfmt",
        "oxlint",
        "node",
      ])
      expect(prompter.logs.filter((log) => log.level === "error")).toStrictEqual([
        { level: "error", message: "`adamantite check` failed after the Claude Code session." },
        {
          level: "error",
          message: "`adamantite rule test` failed after the Claude Code session.",
        },
      ])
    })
  )

  it.effect(
    "fail and name the missing tool when the rule tests cannot start after the session",
    () =>
      Effect.gen(function* () {
        const { exit, prompter } = yield* runInteractiveHarden({
          files: RULE_TEST_FILES,
          prompter: { selectResponses: [claudeAgent] },
          runner: { commandExits: { node: "not-found" } },
        })

        expect(Exit.isFailure(exit)).toBe(true)
        expect(prompter.logs.filter((log) => log.level === "error")).toStrictEqual([
          { level: "error", message: "Command `node` not found. Please install it and try again." },
          {
            level: "error",
            message: "`adamantite rule test` failed after the Claude Code session.",
          },
        ])
      })
  )

  it.effect("fail and say so when check fails after the session", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runInteractiveHarden({
        prompter: { selectResponses: [claudeAgent] },
        runner: { commandExits: { oxlint: 1 } },
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "error",
        message: "`adamantite check` failed after the Claude Code session.",
      })
      expect(prompter.logs).not.toContainEqual(expect.objectContaining({ level: "warning" }))
      expect(prompter.outros).toStrictEqual(["⚠️ Harden verification failed."])
    })
  )

  it.effect("fail and name the missing tool when check cannot start after the session", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runInteractiveHarden({
        prompter: { selectResponses: [claudeAgent] },
        runner: { commandExits: { oxfmt: "not-found" } },
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs.filter((log) => log.level === "error")).toStrictEqual([
        { level: "error", message: "Command `oxfmt` not found. Please install it and try again." },
        { level: "error", message: "`adamantite check` failed after the Claude Code session." },
      ])
      expect(prompter.outros).toStrictEqual(["⚠️ Harden verification failed."])
    })
  )

  it.effect("fail and show the findings when Doctor finds issues after the session", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runInteractiveHarden({
        // Knip is installed without its managed config, so Doctor reports one finding.
        files: {
          ...ADAMANTITE_MODULE,
          "AGENTS.md": "# AGENTS.md\n",
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
        prompter: { selectResponses: [claudeAgent] },
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "Doctor found issues after the Claude Code session.",
      })
      expect(prompter.logs).not.toContainEqual(expect.objectContaining({ level: "error" }))
      expect(prompter.notes).toStrictEqual([
        expect.objectContaining({ title: "1. Missing knip configuration" }),
      ])
      expect(prompter.outros).toStrictEqual(["⚠️ Harden verification failed."])
    })
  )

  it.effect("show the Doctor warnings and still pass when Doctor finds no issues", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runInteractiveHarden({
        // Doctor cannot read a `dir` that is not a string literal, so it warns without a finding.
        files: {
          "oxlint.config.ts": CUSTOM_RULES_CONFIG.replace('dir: "tooling/rules"', "dir: rulesDir"),
          ...INSTALLED,
        },
        prompter: { selectResponses: [claudeAgent] },
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs.filter((log) => log.level !== "info")).toStrictEqual([
        {
          level: "warning",
          message:
            "Doctor cannot read the `dir` of a `custom()` call in `oxlint.config.ts`, because it is not a string literal. Doctor does not check that rules folder.",
        },
        SUCCESS_LOG,
      ])
      expect(prompter.outros).toStrictEqual(["✅ Harden completed successfully!"])
    })
  )

  it.effect("print the prompt and copy it when the user chooses to copy", () =>
    Effect.gen(function* () {
      const { copied, exit, prompter, runner } = yield* runInteractiveHarden({
        files: RULE_TEST_FILES,
        prompter: { selectResponses: ["copy"] },
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(nonProbeInvocations(runner)).toStrictEqual([])
      expect(prompter.messages).toStrictEqual([expect.stringMatching(/^# Adamantite harden\n/)])
      expect(copied).toStrictEqual(prompter.messages)
      expect(prompter.logs).toStrictEqual([
        {
          level: "success",
          message: "The Markdown prompt was printed and sent to the terminal clipboard.",
        },
      ])
    })
  )

  it.effect("say that no agent CLI is installed and still offer the copy", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runInteractiveHarden({
        prompter: { selectResponses: ["done"] },
        runner: { installedCommands: [] },
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "info",
        message: expect.stringMatching(/^Harden can hand the prompt off when one of these CLIs/u),
      })
      expect(prompter.selectCalls).toStrictEqual([
        expect.objectContaining({
          options: [
            expect.objectContaining({ value: "copy" }),
            expect.objectContaining({ value: "done" }),
          ],
        }),
      ])
    })
  )

  it.effect("offer the copy when the agent fails to start", () =>
    Effect.gen(function* () {
      const { copied, exit, prompter, runner } = yield* runInteractiveHarden({
        files: RULE_TEST_FILES,
        prompter: { confirmResponses: [true], selectResponses: [claudeAgent] },
        runner: { agentExit: "not-found" },
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "error",
        message: "`claude` was not found on PATH. Install Claude Code or copy the prompt instead.",
      })
      expect(prompter.confirmCalls).toStrictEqual([
        { initialValue: true, message: "Copy the Markdown prompt for a coding agent?" },
      ])
      expect(copied).toStrictEqual([expect.stringMatching(/^# Adamantite harden\n/)])
      expect(nonProbeInvocations(runner).map((invocation) => invocation.command)).toStrictEqual([
        "claude",
      ])
    })
  )

  it.effect("fail without side effects when the user cancels the menu", () =>
    Effect.gen(function* () {
      const { copied, exit, prompter, runner } = yield* runInteractiveHarden({
        prompter: { cancelAtPromptIndex: 1 },
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.cancels).toStrictEqual(["Harden was cancelled. Nothing was changed."])
      expect(nonProbeInvocations(runner)).toStrictEqual([])
      expect(copied).toStrictEqual([])
      expect(prompter.outros).toStrictEqual([])
    })
  )

  it.effect("fail when Adamantite is not installed in an interactive terminal", () =>
    Effect.gen(function* () {
      const prompter = createPrompterTestContext()
      const exit = yield* runCommand(hardenCommand, [], {
        files: createFileSystemTestContext({ files: { "package.json": manifest({}) } }),
        layers: [prompter.layer, interactiveTerminalLayer],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter).toMatchObject({
        logs: [
          {
            level: "warning",
            message:
              "`adamantite` is not installed in this project. Install it before running `adamantite harden`.",
          },
        ],
        messages: [],
        outros: ["⚠️ Harden did not start."],
      })
    })
  )
})
