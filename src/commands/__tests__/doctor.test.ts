import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as PlatformError from "effect/PlatformError"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import type { CommandFailedLike } from "#lib/execution/command-runner.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import doctorCommand from "#commands/doctor.ts"
import { type CodingAgent, codingAgents, handoffPrompt } from "#lib/execution/coding-agents.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import { CliNotFound } from "#lib/shared/errors.ts"
import { toKnipTsConfigContent } from "#lib/workspace/tooling/knip.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import {
  type RunnerTestContext,
  createPrompterTestContext,
  createRunnerTestContext,
  runCommand,
} from "./command-test-helpers.ts"

function manifest(value: PackageJson): string {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...value }, null, 2)
}

function makeInteractiveTerminalLayer() {
  return Layer.succeed(TerminalCapabilities)({
    copyToClipboard: () => Effect.void,
    isInteractive: Effect.succeed(true),
  })
}

// Drawn from the shipped catalog so a changed seed or probe form fails these tests.
function agentByCommand(command: string): CodingAgent {
  const agent = codingAgents.find((candidate) => candidate.command === command)

  if (!agent) {
    throw new Error(`No coding agent in the catalog with command \`${command}\``)
  }

  return agent
}

const claudeAgent = agentByCommand("claude")
const codexAgent = agentByCommand("codex")
const geminiAgent = agentByCommand("gemini")

function makeFindingsFixture() {
  return createFileSystemTestContext({
    files: {
      "package.json": manifest({
        devDependencies: { adamantite: "1.0.0", knip: knip.version },
        scripts: { analyze: "adamantite analyze" },
      }),
    },
  })
}

interface HandoffRunnerOptions {
  readonly agentExit?: number | "not-found" | "spawn-error"
  readonly gitExit?: number
  readonly installedCommands?: readonly string[]
  readonly onAgentRun?: () => void
}

function isProbe(invocation: { readonly args: string[] }) {
  return invocation.args[0] === "--version" || invocation.args[0] === "version"
}

// Dispatches on the invocation shape: `--version` probes answer installation,
// `git` answers the working-tree check, and everything else is the agent spawn.
function makeHandoffRunner(options: HandoffRunnerOptions = {}) {
  const installed = options.installedCommands ?? ["claude", "codex"]

  return createRunnerTestContext({
    implementation: (invocation) =>
      Effect.suspend((): Effect.Effect<ChildProcessSpawner.ExitCode, CommandFailedLike> => {
        if (isProbe(invocation)) {
          return installed.includes(invocation.command)
            ? Effect.succeed(ChildProcessSpawner.ExitCode(0))
            : Effect.fail(new CliNotFound({ command: invocation.command }))
        }
        if (invocation.command === "git") {
          return Effect.succeed(ChildProcessSpawner.ExitCode(options.gitExit ?? 0))
        }
        if (options.agentExit === "not-found") {
          return Effect.fail(new CliNotFound({ command: invocation.command }))
        }
        if (options.agentExit === "spawn-error") {
          return Effect.fail(
            PlatformError.systemError({
              _tag: "PermissionDenied",
              method: "spawn",
              module: "FileSystem",
              pathOrDescriptor: invocation.command,
            })
          )
        }
        options.onAgentRun?.()
        return Effect.succeed(ChildProcessSpawner.ExitCode(options.agentExit ?? 0))
      }),
  })
}

function nonProbeInvocations(runner: RunnerTestContext) {
  return runner.invocations.filter((invocation) => !isProbe(invocation))
}

describe("doctor", () => {
  it.effect("report success when no managed integration applies", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }) },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], { files, layers: [prompter.layer] })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toEqual([])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("show no-applicable success framing in an interactive terminal", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }) },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "No applicable integrations found.",
      })
      expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
    })
  )

  it.effect("fail when Adamantite is not installed", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({}) },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], { files, layers: [prompter.layer] })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toEqual([])
      expect(prompter.messages).toEqual([
        "`adamantite` is not installed in this project. Install it before running `adamantite doctor`.",
      ])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("show the missing-package failure in an interactive terminal", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({}) },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "`adamantite` is not installed in this project. Install it before running `adamantite doctor`.",
      })
      expect(prompter.messages).toEqual([])
      expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
    })
  )

  it.effect("print the Markdown prompt directly in a non-interactive terminal", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], { files, layers: [prompter.layer] })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.messages).toHaveLength(1)
      expect(prompter.messages[0]).toContain("# Adamantite doctor findings")
      expect(prompter.messages[0]).toContain("## 1. Missing knip configuration")
      expect(prompter.intros).toEqual([])
      expect(prompter.notes).toEqual([])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("include assessment warnings in the non-interactive Markdown output", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze", check: "adamantite check" },
            workspaces: ["packages/*"],
          }),
        },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], { files, layers: [prompter.layer] })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.messages).toHaveLength(1)
      expect(prompter.messages[0]).toContain("# Adamantite doctor findings")
      expect(prompter.messages[0]).toContain("Skipping `tsconfig.json` setup")
      expect(prompter.logs).toEqual([])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("print warning-only Markdown in a non-interactive terminal", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".github/workflows/adamantite.yml": "node-version: 22\n",
          "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }),
        },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], { files, layers: [prompter.layer] })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.messages).toHaveLength(1)
      expect(prompter.messages[0]).toContain("# Adamantite doctor warnings")
      expect(prompter.messages[0]).toContain("No CI-compatible managed scripts were found")
      expect(prompter.logs).toEqual([])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("report success when managed state meets the oracle", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "knip.config.ts": toKnipTsConfigContent(),
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], { files, layers: [prompter.layer] })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toEqual([])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("show success framing in an interactive terminal", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "knip.config.ts": toKnipTsConfigContent(),
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({ level: "success", message: "No issues found." })
      expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
    })
  )

  it.effect("keep --fix parseable with a replacement error", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }) },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, ["--fix"], {
        files,
        layers: [prompter.layer],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toEqual([])
      expect(prompter.messages).toEqual([
        "`doctor --fix` has been removed. Run `adamantite doctor` and follow the reported goal criteria.",
      ])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("show the removed-fix failure in an interactive terminal", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }) },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, ["--fix"], {
        files,
        layers: [prompter.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "error",
        message:
          "`doctor --fix` has been removed. Run `adamantite doctor` and follow the reported goal criteria.",
      })
      expect(prompter.messages).toEqual([])
      expect(prompter.outros).toEqual(["❌ Doctor did not run"])
    })
  )

  it.effect("show formatted findings and copy the Markdown prompt", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const copied: string[] = []
      const prompter = createPrompterTestContext({ selectResponses: ["copy"] })
      const runner = makeHandoffRunner()
      const interactive = Layer.succeed(TerminalCapabilities)({
        copyToClipboard: (content) => Effect.sync(() => copied.push(content)),
        isInteractive: Effect.succeed(true),
      })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, runner.layer, interactive],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.notes).toEqual([
        expect.objectContaining({
          message: expect.stringContaining(
            "Current state\nThe managed `knip.config.ts` file is missing."
          ),
          title: "1. Missing knip configuration",
        }),
      ])
      expect(prompter.selectCalls).toEqual([
        expect.objectContaining({
          message: "How do you want to resolve these findings?",
          options: [
            expect.objectContaining({ label: "Hand off to Claude Code" }),
            expect.objectContaining({ label: "Hand off to Codex" }),
            expect.objectContaining({
              label: "Copy the Markdown prompt for a coding agent",
              value: "copy",
            }),
            expect.objectContaining({ label: "Do nothing", value: "done" }),
          ],
        }),
      ])
      expect(prompter.confirmCalls).toEqual([])
      expect(copied).toHaveLength(1)
      expect(copied[0]).toContain("# Adamantite doctor findings")
      expect(copied[0]).toContain("Do not suppress or work around checks")
      expect(prompter.messages).toHaveLength(1)
      expect(prompter.messages[0]).toContain("# Adamantite doctor findings")
      expect(prompter.messages[0]).toContain("Do not suppress or work around checks")
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "The Markdown prompt was printed and sent to the terminal clipboard.",
      })
      expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
    })
  )

  it.effect("fail without prompting further when the user chooses to do nothing", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const prompter = createPrompterTestContext({ selectResponses: ["done"] })
      const runner = makeHandoffRunner()

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, runner.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.confirmCalls).toEqual([])
      expect(nonProbeInvocations(runner)).toEqual([])
      expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
    })
  )

  it.effect("hand off to an agent and succeed when reassessment finds no issues", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const prompter = createPrompterTestContext({ selectResponses: [claudeAgent] })
      // A nonzero agent exit must not matter: reassessment is the oracle.
      const runner = makeHandoffRunner({
        agentExit: 1,
        onAgentRun: () => {
          files.write("knip.config.ts", toKnipTsConfigContent())
        },
      })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, runner.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(nonProbeInvocations(runner)).toEqual([
        expect.objectContaining({
          args: ["diff", "--quiet", "HEAD"],
          command: "git",
          stderr: "ignore",
          stdout: "ignore",
        }),
        expect.objectContaining({
          args: [handoffPrompt],
          command: "claude",
          stderr: "inherit",
          stdin: "inherit",
          stdout: "inherit",
        }),
      ])
      expect(nonProbeInvocations(runner)[1]?.args[0]).not.toContain("knip")
      expect(prompter.logs).toContainEqual({
        level: "info",
        message: "Handing the terminal to Claude Code. Exit the agent to return to Doctor.",
      })
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "All findings were resolved by Claude Code.",
      })
      expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
    })
  )

  it.effect("report surviving findings and fail when the agent repairs nothing", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const prompter = createPrompterTestContext({
        confirmResponses: [false],
        selectResponses: [claudeAgent],
      })
      const runner = makeHandoffRunner()

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, runner.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "1 of 1 findings remain after the Claude Code session.",
      })
      expect(prompter.confirmCalls).toContainEqual({
        initialValue: true,
        message: "Copy the Markdown prompt for a coding agent?",
      })
      expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
    })
  )

  it.effect("fall back to the prompt copy offer when the agent CLI is missing", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const prompter = createPrompterTestContext({
        confirmResponses: [false],
        selectResponses: [claudeAgent],
      })
      // Installed at menu time, gone at spawn time: the race the fallback covers.
      const runner = makeHandoffRunner({ agentExit: "not-found" })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, runner.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "error",
        message: "`claude` was not found on PATH. Install Claude Code or copy the prompt instead.",
      })
      expect(prompter.confirmCalls).toContainEqual({
        initialValue: true,
        message: "Copy the Markdown prompt for a coding agent?",
      })
      expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
    })
  )

  it.effect("surface the spawn failure detail and fall back to the copy offer", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const prompter = createPrompterTestContext({
        confirmResponses: [false],
        selectResponses: [codexAgent],
      })
      const runner = makeHandoffRunner({ agentExit: "spawn-error" })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, runner.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "error",
        message: expect.stringContaining("Failed to start Codex:"),
      })
      expect(prompter.confirmCalls).toContainEqual({
        initialValue: true,
        message: "Copy the Markdown prompt for a coding agent?",
      })
      expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
    })
  )

  it.effect("require confirmation for a dirty working tree and stop when declined", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const prompter = createPrompterTestContext({
        confirmResponses: [false, false],
        selectResponses: [claudeAgent],
      })
      const runner = makeHandoffRunner({ gitExit: 1 })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, runner.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "The Git working tree has uncommitted changes. The agent will edit files on top of them.",
      })
      expect(prompter.confirmCalls).toContainEqual({
        initialValue: false,
        message: "Hand off to Claude Code anyway?",
      })
      expect(nonProbeInvocations(runner)).toHaveLength(1)
      expect(nonProbeInvocations(runner)[0]?.command).toBe("git")
      expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
    })
  )

  it.effect("hand off after confirming an unknown working tree state", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const prompter = createPrompterTestContext({
        confirmResponses: [true],
        selectResponses: [claudeAgent],
      })
      const runner = makeHandoffRunner({
        gitExit: 128,
        onAgentRun: () => {
          files.write("knip.config.ts", toKnipTsConfigContent())
        },
      })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, runner.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "Doctor could not confirm a clean Git working tree. The agent will edit files without a checkpoint to return to.",
      })
      expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
    })
  )

  it.effect("fail and record the cancellation when the resolve prompt is cancelled", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const prompter = createPrompterTestContext({ cancelAtPromptIndex: 1 })
      const runner = makeHandoffRunner()

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, runner.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.cancels).toEqual(["Doctor was cancelled. The findings remain."])
      expect(nonProbeInvocations(runner)).toEqual([])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("offer only the copy actions when no agent CLI is installed", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const prompter = createPrompterTestContext({
        confirmResponses: [false],
        selectResponses: ["copy"],
      })
      const runner = makeHandoffRunner({ installedCommands: [] })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, runner.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "info",
        message:
          "Doctor can hand findings off when one of these CLIs is installed: `claude`, `codex`, `cursor-agent`, `gemini`, `grok`, `opencode`.",
      })
      expect(prompter.selectCalls).toEqual([
        expect.objectContaining({
          options: [
            expect.objectContaining({
              label: "Copy the Markdown prompt for a coding agent",
              value: "copy",
            }),
            expect.objectContaining({ label: "Do nothing", value: "done" }),
          ],
        }),
      ])
      expect(prompter.spinnerEntries).toContainEqual({
        message: "No supported coding agent CLI was found on PATH.",
        type: "stop",
      })
    })
  )

  it.effect("seed agents that need a flag with their own arguments", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const prompter = createPrompterTestContext({ selectResponses: [geminiAgent] })
      const runner = makeHandoffRunner({
        installedCommands: ["gemini"],
        onAgentRun: () => {
          files.write("knip.config.ts", toKnipTsConfigContent())
        },
      })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, runner.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(nonProbeInvocations(runner)[1]).toEqual(
        expect.objectContaining({
          args: ["-i", handoffPrompt],
          command: "gemini",
        })
      )
      expect(prompter.spinnerEntries).toContainEqual({
        message: "Found Gemini CLI.",
        type: "stop",
      })
    })
  )
})
