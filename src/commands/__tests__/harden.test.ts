import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import hardenCommand from "#commands/harden.ts"
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

// The phrases that are missing from a section, so a failure names each one.
function getMissingPhrases(section: string, phrases: readonly string[]) {
  return phrases.filter((phrase) => !section.includes(phrase))
}

// The phrases that each section must keep, so a failure names each lost one.
const REQUIRED_PHRASES = {
  "## 2. Survey the code": ["This step is done when each area has its candidates"],
  "## 3. Drop what a tool already enforces": ["lint a counterexample from step 2 where it is"],
  "## 5. Show the candidates and wait for approval": [
    "This step is done when the user names the candidates to write",
    "When no human can approve",
    "Stop after this step.",
  ],
  "## 6. Write the approved standards": [
    "`adamantite rule add <name>`",
    'the "Custom rules" section of the Adamantite skill',
    "pass it with `--dir`",
    "states the standard and why it exists",
    "delete the instruction of each standard that a rule now checks",
    "keep the code that a new rule reports as it is",
    "for a custom rule, use the `rules` option of `custom()`",
    "for a preset rule or an import rule, set it in the Oxlint config",
    "`CODING_STANDARDS.md`",
  ],
  "## Verify": ["`adamantite check`", "`adamantite doctor`", "Both must exit 0."],
} satisfies Readonly<Record<string, readonly string[]>>

const INSTALLED = manifest({ devDependencies: { adamantite: "1.0.0" } })

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

function runHarden(files: Record<string, string>) {
  return Effect.gen(function* () {
    const prompter = createPrompterTestContext()
    const exit = yield* runCommand(hardenCommand, [], {
      files: createFileSystemTestContext({ files }),
      layers: [prompter.layer],
    })

    return { exit, prompter }
  })
}

const claudeAgent = agentByCommand("claude")

const HARDEN_FILES = { "oxlint.config.ts": CORE_CONFIG, "package.json": INSTALLED }

function runInteractiveHarden(
  prompterOptions: Parameters<typeof createPrompterTestContext>[0],
  runnerOptions: Parameters<typeof makeHandoffRunner>[0] = {}
) {
  return Effect.gen(function* () {
    const copied: string[] = []
    const prompter = createPrompterTestContext(prompterOptions)
    const runner = makeHandoffRunner(runnerOptions)
    const terminal = Layer.succeed(TerminalCapabilities)({
      copyToClipboard: (content) => Effect.sync(() => copied.push(content)),
      isInteractive: Effect.succeed(true),
    })
    const exit = yield* runCommand(hardenCommand, [], {
      files: createFileSystemTestContext({ files: HARDEN_FILES }),
      layers: [prompter.layer, runner.layer, terminal],
    })

    return { copied, exit, prompter, runner }
  })
}

function runHardenPrompt(files: Record<string, string>) {
  return Effect.gen(function* () {
    const { exit, prompter } = yield* runHarden(files)

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(prompter.messages).toHaveLength(1)

    return prompter.messages[0] ?? ""
  })
}

describe("harden", () => {
  it.effect("print the prompt and succeed in a non-interactive terminal", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runHarden({
        "oxlint.config.ts": CORE_CONFIG,
        "package.json": INSTALLED,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.messages.map(getHeadings)).toStrictEqual([
        [
          "# Adamantite harden",
          "## Context",
          "### Oxlint config",
          "### Rules folders",
          "### Instructions",
          "## 1. List the written standards",
          "## 2. Survey the code",
          "## 3. Drop what a tool already enforces",
          "## 4. Place each candidate on the enforcement ladder",
          "## 5. Show the candidates and wait for approval",
          "## 6. Write the approved standards",
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
        "package.json": INSTALLED,
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
        "package.json": INSTALLED,
      })
      const rulesFolders = getSection(prompt, "### Rules folders")

      expect(rulesFolders).toContain("adamantite/lint/custom")
      expect(rulesFolders).toContain(".adamantite/rules")
      expect(getSection(prompt, "### Instructions")).toContain("No instruction file was found.")
    })
  )

  it.effect("defer adamantite init to the approval when no Oxlint config exists", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({ "package.json": INSTALLED })

      expect(
        getMissingPhrases(getSection(prompt, "### Oxlint config"), [
          "tell the user to run `adamantite init` before step 6",
        ])
      ).toStrictEqual([])
    })
  )

  it.effect("keep placeholder-like text in a detected path literal", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "oxlint.config.ts": CUSTOM_RULES_CONFIG.replace("tooling/rules", "rules/{{version}}"),
        "package.json": INSTALLED,
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
        "package.json": INSTALLED,
      })

      expect(getSection(prompt, "### Rules folders")).toContain("`oxlint.config.ts`")
    })
  )

  it.effect(
    "have the read-only phase, the approval gate, the write steps, and the verification",
    () =>
      Effect.gen(function* () {
        const prompt = yield* runHardenPrompt({
          "oxlint.config.ts": CORE_CONFIG,
          "package.json": INSTALLED,
        })
        const missing = Object.entries(REQUIRED_PHRASES).flatMap(([heading, phrases]) =>
          getMissingPhrases(getSection(prompt, heading), phrases).map(
            (phrase) => `${heading}: ${phrase}`
          )
        )

        expect(prompt.slice(0, prompt.indexOf("\n## Context\n"))).toContain(
          "Steps 1 to 5 are read-only."
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

  it.effect("offer a handoff to each installed agent, the copy, and nothing", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runInteractiveHarden({ selectResponses: ["done"] })

      expect(Exit.isSuccess(exit)).toBe(true)
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

  it.effect("hand off to an agent seeded with the prompt and succeed", () =>
    Effect.gen(function* () {
      // The agent's exit code does not decide the result.
      const { exit, prompter, runner } = yield* runInteractiveHarden(
        { selectResponses: [claudeAgent] },
        { agentExit: 1 }
      )

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
      ])
      expect(prompter).toMatchObject({
        logs: [
          {
            level: "info",
            message: "Handing the terminal to Claude Code. Exit the agent to return to Harden.",
          },
        ],
        outros: ["✅ The Claude Code session ended."],
      })
    })
  )

  it.effect("print the prompt and copy it when the user chooses to copy", () =>
    Effect.gen(function* () {
      const { copied, exit, prompter, runner } = yield* runInteractiveHarden({
        selectResponses: ["copy"],
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
      const { exit, prompter } = yield* runInteractiveHarden(
        { selectResponses: ["done"] },
        { installedCommands: [] }
      )

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
      const { copied, exit, prompter } = yield* runInteractiveHarden(
        { confirmResponses: [true], selectResponses: [claudeAgent] },
        { agentExit: "not-found" }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "error",
        message: "`claude` was not found on PATH. Install Claude Code or copy the prompt instead.",
      })
      expect(prompter.confirmCalls).toStrictEqual([
        { initialValue: true, message: "Copy the Markdown prompt for a coding agent?" },
      ])
      expect(copied).toStrictEqual([expect.stringMatching(/^# Adamantite harden\n/)])
    })
  )

  it.effect("fail without side effects when the user cancels the menu", () =>
    Effect.gen(function* () {
      const { copied, exit, prompter, runner } = yield* runInteractiveHarden({
        cancelAtPromptIndex: 1,
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
