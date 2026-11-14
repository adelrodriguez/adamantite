import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { createTerminalTestContext, type TestKey } from "#__tests__/terminal.ts"
import doctorCommand from "#commands/doctor.ts"
import { toKnipTsConfigContent } from "#lib/integrations/tooling/knip/config.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import {
  makeHandoffRunner,
  nonProbeInvocations,
  promptingLayer,
  runCommand,
} from "./command-test-helpers.ts"

function manifest(value: PackageJson): string {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...value }, null, 2)
}

const decodeLines = Schema.decodeUnknownSync(Schema.Array(Schema.String))

function getHeadings(markdown: string) {
  return markdown.match(/^#{1,2} .+$/gm) ?? []
}

function makeFindingsFixture() {
  return createFileSystemTestContext({
    files: {
      "AGENTS.md": "# AGENTS.md\n",
      "package.json": manifest({
        devDependencies: { adamantite: "1.0.0", knip: knip.version },
        scripts: { analyze: "adamantite analyze" },
      }),
    },
  })
}

// Runs doctor on the findings fixture in an interactive terminal with the given keys. The installed
// agents come before the copy choice in the menu.
function runResolution(keys: readonly TestKey[], runner = makeHandoffRunner()) {
  return Effect.gen(function* () {
    const files = makeFindingsFixture()
    const logLines: unknown[] = []
    const terminal = createTerminalTestContext(keys)

    const exit = yield* runCommand(doctorCommand, [], {
      files,
      layers: [runner.layer, promptingLayer],
      logLines,
      terminal,
    })

    return { exit, files, logLines, runner, terminal }
  })
}

const INTRO = "💠 adamantite doctor"

const FINDING_NOTE = expect.stringMatching(
  /^\n1\. Missing knip configuration\n {2}Current state\n {2}The managed `knip\.config\.ts` file is missing\./u
)

const FINDINGS_MARKDOWN = expect.stringMatching(
  /^# Adamantite doctor findings\n[\s\S]*Fix the cause of each finding/u
)

const COPIED = "✔ The agent prompt is printed above and sent to the terminal clipboard."
const FOUND_ISSUES = "⚠️ Doctor found issues."

// No managed integration applies to a project that has only the adamantite package.
const NO_INTEGRATION_FILES = {
  "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }),
}

const HEALTHY_FILES = {
  "AGENTS.md": "# AGENTS.md\n",
  "knip.config.ts": toKnipTsConfigContent(),
  "package.json": manifest({
    devDependencies: { adamantite: "1.0.0", knip: knip.version },
    scripts: { analyze: "adamantite analyze" },
  }),
}

describe("doctor", () => {
  it.effect.each([
    {
      files: NO_INTEGRATION_FILES,
      layers: [],
      lines: [],
      name: "no managed integration applies in a non-interactive terminal",
    },
    {
      files: NO_INTEGRATION_FILES,
      layers: [promptingLayer],
      lines: [
        INTRO,
        "✔ No Adamantite-managed setup found. Run `adamantite init` to configure the project.",
        "✅ Doctor finished.",
      ],
      name: "no managed integration applies in an interactive terminal",
    },
    {
      files: HEALTHY_FILES,
      layers: [],
      lines: [],
      name: "managed state meets the oracle in a non-interactive terminal",
    },
    {
      files: HEALTHY_FILES,
      layers: [promptingLayer],
      lines: [INTRO, "✔ No setup repairs needed.", "✅ Doctor finished."],
      name: "managed state meets the oracle in an interactive terminal",
    },
  ])("report success when $name", ({ files, layers, lines }) =>
    Effect.gen(function* () {
      const logLines: unknown[] = []

      const exit = yield* runCommand(doctorCommand, [], {
        files: createFileSystemTestContext({ files }),
        layers: [...layers],
        logLines,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(logLines).toStrictEqual(lines)
    })
  )

  it.effect.each([
    {
      layers: [],
      lines: [
        "`adamantite` is not installed in this project. Install it before running `adamantite doctor`.",
      ],
      name: "a non-interactive terminal",
    },
    {
      layers: [promptingLayer],
      lines: [
        INTRO,
        "▲ `adamantite` is not installed in this project. Install it before running `adamantite doctor`.",
        FOUND_ISSUES,
      ],
      name: "an interactive terminal",
    },
  ])("fail when Adamantite is not installed in $name", ({ layers, lines }) =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({ files: { "package.json": manifest({}) } })
      const logLines: unknown[] = []

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [...layers],
        logLines,
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual(lines)
    })
  )

  it.effect("report a missing install before it reads the workspace packages", () =>
    Effect.gen(function* () {
      // A workspace package manifest that does not parse must not hide the install instruction.
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({ workspaces: ["packages/*"] }),
          "packages/web/package.json": "{",
        },
      })

      const logLines: unknown[] = []

      const exit = yield* runCommand(doctorCommand, [], { files, logLines })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        "`adamantite` is not installed in this project. Install it before running `adamantite doctor`.",
      ])
    })
  )

  it.effect("print only the Markdown prompt in a non-interactive terminal", () =>
    Effect.gen(function* () {
      const logLines: unknown[] = []

      const exit = yield* runCommand(doctorCommand, [], {
        files: makeFindingsFixture(),
        logLines,
      })

      expect(Exit.isFailure(exit)).toBe(true)
      // One line: no intro, note, or outro comes with the Markdown.
      expect(decodeLines(logLines).map((line) => getHeadings(line))).toStrictEqual([
        [
          "# Adamantite doctor findings",
          "## 1. Missing knip configuration",
          "## Verify",
          "## Check the repair",
        ],
      ])
    })
  )

  it.effect("report a project root without AGENTS.md", () =>
    Effect.gen(function* () {
      const { "AGENTS.md": _agents, ...files } = HEALTHY_FILES
      const logLines: unknown[] = []

      const exit = yield* runCommand(doctorCommand, [], {
        files: createFileSystemTestContext({ files }),
        logLines,
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(decodeLines(logLines).map((line) => getHeadings(line))).toStrictEqual([
        [
          "# Adamantite doctor findings",
          "## 1. Missing AGENTS.md",
          "## Verify",
          "## Check the repair",
        ],
      ])
    })
  )

  it.effect("include assessment warnings in the non-interactive Markdown output", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: "github:webpro-nl/knip" },
            scripts: { analyze: "adamantite analyze", check: "adamantite check" },
            workspaces: ["packages/*"],
          }),
        },
      })

      const logLines: unknown[] = []

      const exit = yield* runCommand(doctorCommand, [], { files, logLines })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        expect.stringMatching(
          /^# Adamantite doctor findings\n[\s\S]*`knip` is declared as `github:webpro-nl\/knip`/u
        ),
      ])
    })
  )

  it.effect("print warning-only Markdown in a non-interactive terminal", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".github/workflows/adamantite.yml": [
            "on: push",
            "jobs:",
            "  # ADAMANTITE:START",
            "  verify:",
            "    runs-on: ubuntu-latest",
            "    steps:",
            "      - uses: actions/setup-node@v7",
            "        with:",
            "          node-version: 22",
            "  # ADAMANTITE:END",
            "",
          ].join("\n"),
          "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }),
        },
      })

      const logLines: unknown[] = []

      const exit = yield* runCommand(doctorCommand, [], { files, logLines })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        expect.stringMatching(
          /^# Adamantite doctor warnings\n[\s\S]*No CI-compatible managed scripts were found/u
        ),
      ])
    })
  )

  it.effect("show each finding as a note and offer the resolutions", () =>
    Effect.gen(function* () {
      const { exit, logLines, terminal } = yield* runResolution(["down", "down", "enter"])

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines[1]).toStrictEqual(FINDING_NOTE)
      expect(terminal.output()).toMatch(
        /^\? How do you want to resolve these findings\? › \n❯ Hand off to Claude Code \n {2}Hand off to Codex \n {2}Copy the agent prompt \n {2}Finish without an agent /u
      )
      expect(terminal.output()).not.toContain("Copy the agent prompt?")
    })
  )

  it.effect("print the Markdown prompt and copy it when the user chooses to copy", () =>
    Effect.gen(function* () {
      const { exit, logLines, terminal } = yield* runResolution(["down", "down", "enter"])

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([INTRO, FINDING_NOTE, FINDINGS_MARKDOWN, COPIED, FOUND_ISSUES])
      expect(terminal.copied()).toStrictEqual([logLines[2]])
    })
  )

  it.effect("fail without prompting further when the user chooses to do nothing", () =>
    Effect.gen(function* () {
      const { exit, logLines, runner, terminal } = yield* runResolution([
        "down",
        "down",
        "down",
        "enter",
      ])

      expect(Exit.isFailure(exit)).toBe(true)
      expect(terminal.output()).not.toContain("Copy the agent prompt?")
      expect(nonProbeInvocations(runner)).toStrictEqual([])
      expect(logLines).toStrictEqual([INTRO, FINDING_NOTE, FOUND_ISSUES])
    })
  )

  // The agent sets its own terminal mode, so the menu's input must close before the agent starts.
  it.effect("release the terminal input before the agent starts", () =>
    Effect.gen(function* () {
      const terminal = createTerminalTestContext(["enter", "n"])
      const releasesAtStart: number[] = []

      const runner = makeHandoffRunner({
        onAgentRun: () => {
          releasesAtStart.push(terminal.releases())
        },
      })

      yield* runCommand(doctorCommand, [], {
        files: makeFindingsFixture(),
        layers: [runner.layer, promptingLayer],
        terminal,
      })

      expect(releasesAtStart).toStrictEqual([1])
    })
  )

  it.effect("hand off to an agent and succeed when reassessment finds no issues", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const logLines: unknown[] = []

      // A nonzero agent exit must not matter: reassessment is the oracle.
      const runner = makeHandoffRunner({
        agentExit: 1,
        onAgentRun: () => {
          files.write("knip.config.ts", toKnipTsConfigContent())
        },
      })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [runner.layer, promptingLayer],
        logLines,
        terminal: createTerminalTestContext(["enter"]),
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(nonProbeInvocations(runner)).toStrictEqual([
        expect.objectContaining({
          // The seeded agent often cannot reach `adamantite` on PATH; the prompt must say how.
          args: [
            expect.stringMatching(
              /^# Adamantite doctor findings\n[\s\S]*knip[\s\S]*`npx` or `pnpm exec`/u
            ),
          ],
          command: "claude",
          stderr: "inherit",
          stdin: "inherit",
          stdout: "inherit",
        }),
      ])
      expect(logLines).toStrictEqual([
        INTRO,
        FINDING_NOTE,
        "● Handing the terminal to Claude Code. Exit the agent to return to Doctor.",
        "✔ All findings were resolved by Claude Code.",
        "✅ Doctor finished.",
      ])
    })
  )

  it.effect("report surviving findings and fail when the agent repairs nothing", () =>
    Effect.gen(function* () {
      const { exit, logLines, terminal } = yield* runResolution(["enter", "n"])

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        INTRO,
        FINDING_NOTE,
        "● Handing the terminal to Claude Code. Exit the agent to return to Doctor.",
        "▲ Doctor still reports 1 unresolved finding after the Claude Code session.",
        FINDING_NOTE,
        FOUND_ISSUES,
      ])
      // The copy offer defaults to yes, and the user declines it.
      expect(terminal.output()).toContain(
        "? Copy the agent prompt? › (Y/n)✔ Copy the agent prompt? … no"
      )
    })
  )

  it.effect("fall back to the prompt copy offer when the agent CLI is missing", () =>
    Effect.gen(function* () {
      // Installed at menu time, gone at spawn time: the race the fallback covers.
      const { exit, logLines, terminal } = yield* runResolution(
        ["enter", "n"],
        makeHandoffRunner({ agentExit: "not-found" })
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        INTRO,
        FINDING_NOTE,
        "● Handing the terminal to Claude Code. Exit the agent to return to Doctor.",
        "✖ `claude` was not found on PATH. Install Claude Code or copy the prompt instead.",
        FOUND_ISSUES,
      ])
      expect(terminal.output()).toContain("✔ Copy the agent prompt? … no")
    })
  )

  it.effect("surface the spawn failure detail and fall back to the copy offer", () =>
    Effect.gen(function* () {
      const { exit, logLines, terminal } = yield* runResolution(
        ["down", "enter", "n"],
        makeHandoffRunner({ agentExit: "spawn-error" })
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        INTRO,
        FINDING_NOTE,
        "● Handing the terminal to Codex. Exit the agent to return to Doctor.",
        expect.stringMatching(/^✖ Failed to start Codex: /u),
        FOUND_ISSUES,
      ])
      expect(terminal.output()).toContain("✔ Copy the agent prompt? … no")
    })
  )

  it.effect("fail and record the cancellation when the resolve prompt is cancelled", () =>
    Effect.gen(function* () {
      const { exit, logLines, runner } = yield* runResolution(["ctrl+c"])

      expect(Exit.isFailure(exit)).toBe(true)
      expect(nonProbeInvocations(runner)).toStrictEqual([])
      expect(logLines).toStrictEqual([
        INTRO,
        FINDING_NOTE,
        "\n■ Doctor was cancelled. The findings remain.",
      ])
    })
  )

  it.effect("offer only the copy actions when no agent CLI is installed", () =>
    Effect.gen(function* () {
      const { exit, logLines, terminal } = yield* runResolution(
        ["enter"],
        makeHandoffRunner({ installedCommands: [] })
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        INTRO,
        FINDING_NOTE,
        expect.stringMatching(
          /^● No supported coding agent was found on PATH\. Doctor can hand findings off when one of these CLIs is installed: /u
        ),
        FINDINGS_MARKDOWN,
        COPIED,
        FOUND_ISSUES,
      ])
      expect(terminal.output()).toMatch(
        /^\? How do you want to resolve these findings\? › \n❯ Copy the agent prompt \n {2}Finish without an agent /u
      )
    })
  )

  it.effect("seed agents that need a flag with their own arguments", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const terminal = createTerminalTestContext(["enter"])

      const runner = makeHandoffRunner({
        installedCommands: ["gemini"],
        onAgentRun: () => {
          files.write("knip.config.ts", toKnipTsConfigContent())
        },
      })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [runner.layer, promptingLayer],
        terminal,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(nonProbeInvocations(runner)[0]).toStrictEqual(
        expect.objectContaining({
          args: ["-i", expect.stringContaining("# Adamantite doctor findings")],
          command: "gemini",
        })
      )
      expect(terminal.output()).toContain("❯ Hand off to Gemini CLI \n  Copy the agent prompt ")
    })
  )
})
