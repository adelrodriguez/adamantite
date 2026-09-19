import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import {
  checkWorkingTreeState,
  detectAgent,
  CODING_AGENT_IDS,
  detectInstalledAgents,
  getCodingAgent,
  type PermissionProfile,
  runHeadlessSession,
} from "#lib/agent-repair/driver.ts"
import { type CapturedCommandRunOptions, CommandRunner } from "#lib/execution/command-runner.ts"
import { CliNotFound } from "#lib/shared/errors.ts"

function runnerWith(capture: Parameters<typeof CommandRunner.make>[0]["capture"]) {
  return Layer.succeed(
    CommandRunner,
    CommandRunner.make({
      capture,
      exitCode: () => Effect.succeed(ChildProcessSpawner.ExitCode(0)),
    })
  )
}

function exited(stdout: string) {
  return {
    exitCode: ChildProcessSpawner.ExitCode(0),
    status: "exited" as const,
    stderr: "",
    stdout,
  }
}

const files: PermissionProfile = { kind: "files", timeout: "5 minutes" }
const shell: PermissionProfile = {
  exactCommands: ["rm /project/old.json"],
  kind: "files-and-shell",
  shellPrefixes: ["pnpm exec adamantite doctor"],
  timeout: "10 minutes",
}

const expected = {
  claude: {
    files: [
      "-p",
      "PROMPT",
      "--permission-prompts",
      "none",
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      "Read Edit Write",
    ],
    shell: [
      "-p",
      "PROMPT",
      "--permission-prompts",
      "none",
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      "Read Edit Write Bash(pnpm exec adamantite doctor *) Bash(rm /project/old.json)",
    ],
  },
  codex: {
    files: ["exec", "--sandbox", "workspace-write", "PROMPT"],
    shell: ["exec", "--sandbox", "workspace-write", "PROMPT"],
  },
  cursor: {
    files: ["-p", "PROMPT", "--trust", "--force"],
    shell: ["-p", "PROMPT", "--trust", "--force"],
  },
  gemini: {
    files: [
      "-p",
      "PROMPT",
      "--approval-mode",
      "auto_edit",
      "--allowed-tools",
      "read_file,write_file,replace",
    ],
    shell: [
      "-p",
      "PROMPT",
      "--approval-mode",
      "auto_edit",
      "--allowed-tools",
      "read_file,write_file,replace,run_shell_command(pnpm exec adamantite doctor),run_shell_command(rm /project/old.json)",
    ],
  },
  grok: {
    files: ["-p", "PROMPT", "--permission-mode", "acceptEdits", "--sandbox", "workspace"],
    shell: [
      "-p",
      "PROMPT",
      "--permission-mode",
      "acceptEdits",
      "--sandbox",
      "workspace",
      "--allow",
      "Bash(pnpm exec adamantite doctor *)",
      "--allow",
      "Bash(rm /project/old.json)",
    ],
  },
  opencode: {
    files: ["run", "PROMPT"],
    shell: ["run", "PROMPT"],
  },
} as const

describe("coding agent contracts", () => {
  for (const agent of CODING_AGENT_IDS.map((id) => getCodingAgent(id))) {
    it(`build exact file and shell commands for ${agent.id}`, () => {
      const fileCommand = agent.toHeadlessCommand("PROMPT", files)
      const shellCommand = agent.toHeadlessCommand("PROMPT", shell)

      expect(fileCommand.args).toEqual(expected[agent.id].files)
      expect(shellCommand.args).toEqual(expected[agent.id].shell)
      expect(agent.enforcesPermissions).toBe(agent.id !== "codex" && agent.id !== "cursor")

      if (agent.id === "opencode") {
        expect(fileCommand.env).toEqual({
          OPENCODE_CONFIG_CONTENT:
            '{"permission":{"bash":"deny","edit":"allow","webfetch":"deny"}}',
        })
        expect(shellCommand.env).toEqual({
          OPENCODE_CONFIG_CONTENT:
            '{"permission":{"bash":{"*":"deny","pnpm exec adamantite doctor *":"allow","rm /project/old.json":"allow"},"edit":"allow","webfetch":"deny"}}',
        })
      } else {
        expect(fileCommand.env).toBeUndefined()
        expect(shellCommand.env).toBeUndefined()
      }
    })
  }

  it.effect("pass the profile timeout", () =>
    Effect.gen(function* () {
      const calls: CapturedCommandRunOptions[] = []
      const runner = runnerWith((options) =>
        Effect.sync(() => {
          calls.push(options)
          return {
            exitCode: ChildProcessSpawner.ExitCode(0),
            status: "exited" as const,
            stderr: "",
            stdout: "",
          }
        })
      )
      const result = yield* runHeadlessSession({
        agent: getCodingAgent("codex"),
        cwd: "/project",
        profile: files,
        prompt: "PROMPT",
      }).pipe(Effect.provide(runner))

      expect(result).toEqual({})
      expect(calls[0]).toMatchObject({ command: "codex", timeout: "5 minutes" })
    })
  )

  it.effect("note a timed-out session", () =>
    Effect.gen(function* () {
      const runner = runnerWith(() =>
        Effect.succeed({
          exitCode: null,
          status: "timed-out" as const,
          stderr: "last output",
          stdout: "",
        })
      )
      const result = yield* runHeadlessSession({
        agent: getCodingAgent("claude"),
        cwd: "/project",
        profile: files,
        prompt: "PROMPT",
      }).pipe(Effect.provide(runner))

      expect(result).toEqual({ note: "The agent attempt timed out." })
    })
  )

  it.effect("report a missing agent binary", () =>
    Effect.gen(function* () {
      const runner = runnerWith((options) =>
        Effect.fail(new CliNotFound({ command: options.command }))
      )
      const result = yield* runHeadlessSession({
        agent: getCodingAgent("claude"),
        cwd: "/project",
        profile: files,
        prompt: "PROMPT",
      }).pipe(Effect.provide(runner))

      expect(result).toEqual({
        note: "`claude` was not found. Claude Code 2.1.272 or later is required.",
      })
    })
  )

  it.effect("treat untracked Git output as a dirty tree", () =>
    Effect.gen(function* () {
      const runner = runnerWith(() =>
        Effect.succeed({
          exitCode: ChildProcessSpawner.ExitCode(0),
          status: "exited" as const,
          stderr: "",
          stdout: "?? new-file.ts\n",
        })
      )

      expect(yield* checkWorkingTreeState("/project").pipe(Effect.provide(runner))).toBe("dirty")
    })
  )

  it.effect("probe both Cursor command names", () =>
    Effect.gen(function* () {
      const runner = runnerWith((options) =>
        options.command === "cursor-agent"
          ? Effect.fail(new CliNotFound({ command: options.command }))
          : Effect.succeed(exited("2026.09.12-abc123\n"))
      )

      const installed = yield* detectInstalledAgents("/project").pipe(Effect.provide(runner))
      expect(installed.find((agent) => agent.id === "cursor")?.commands).toEqual(["agent"])
    })
  )

  it.effect("reject an `agent` command that another CLI owns", () =>
    Effect.gen(function* () {
      const runner = runnerWith((options) =>
        options.command === "cursor-agent"
          ? Effect.fail(new CliNotFound({ command: options.command }))
          : Effect.succeed(exited("grok 1.0.30 (04b7ffed98c6) [stable]\n"))
      )

      expect(yield* detectAgent("cursor", "/project").pipe(Effect.provide(runner))).toBeNull()
    })
  )

  it.effect("run the second Cursor command name when the first is missing", () =>
    Effect.gen(function* () {
      const commands: string[] = []
      const runner = runnerWith((options) => {
        commands.push(options.command)
        return options.command === "cursor-agent"
          ? Effect.fail(new CliNotFound({ command: options.command }))
          : Effect.succeed(exited(""))
      })

      const result = yield* runHeadlessSession({
        agent: getCodingAgent("cursor"),
        cwd: "/project",
        profile: files,
        prompt: "PROMPT",
      }).pipe(Effect.provide(runner))

      expect(result).toEqual({})
      expect(commands).toEqual(["cursor-agent", "agent"])
    })
  )
})
