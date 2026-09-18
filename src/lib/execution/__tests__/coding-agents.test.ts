import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import {
  checkWorkingTreeState,
  codingAgents,
  detectInstalledAgents,
  type PermissionProfile,
  runHeadlessSession,
} from "#lib/execution/coding-agents.ts"
import { type CapturedCommandRunOptions, CommandRunner } from "#lib/execution/command-runner.ts"
import { CliNotFound } from "#lib/shared/errors.ts"

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
      "acceptEdits",
      "--allowedTools",
      "Read Edit Write",
    ],
    shell: [
      "-p",
      "PROMPT",
      "--permission-prompts",
      "none",
      "--permission-mode",
      "acceptEdits",
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
      "read_file,write_file,replace,ShellTool(pnpm exec adamantite doctor *),ShellTool(rm /project/old.json)",
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
  for (const agent of codingAgents) {
    it(`build exact file and shell commands for ${agent.id}`, () => {
      const fileCommand = agent.toHeadlessCommand("PROMPT", files)
      const shellCommand = agent.toHeadlessCommand("PROMPT", shell)

      expect(fileCommand.args).toEqual(expected[agent.id].files)
      expect(shellCommand.args).toEqual(expected[agent.id].shell)
      expect(fileCommand.profileEnforced).toBe(agent.id !== "codex" && agent.id !== "cursor")
      expect(shellCommand.profileEnforced).toBe(agent.id !== "codex" && agent.id !== "cursor")

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

  it.effect("pass the profile timeout and return the enforcement flag", () =>
    Effect.gen(function* () {
      const calls: CapturedCommandRunOptions[] = []
      const runner = Layer.succeed(
        CommandRunner,
        CommandRunner.make(
          () => Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          (options) =>
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
      )
      const codex = codingAgents.find((agent) => agent.id === "codex")
      if (codex === undefined) {
        throw new Error("Missing Codex contract")
      }

      const result = yield* runHeadlessSession({
        agent: codex,
        cwd: "/project",
        profile: files,
        prompt: "PROMPT",
      }).pipe(Effect.provide(runner))

      expect(result.profileEnforced).toBe(false)
      expect(calls[0]).toMatchObject({ command: "codex", timeout: "5 minutes" })
    })
  )

  it.effect("return a timed-out session", () =>
    Effect.gen(function* () {
      const runner = Layer.succeed(
        CommandRunner,
        CommandRunner.make(
          () => Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          () =>
            Effect.succeed({
              exitCode: null,
              status: "timed-out" as const,
              stderr: "last output",
              stdout: "",
            })
        )
      )
      const claude = codingAgents.find((agent) => agent.id === "claude")
      if (claude === undefined) {
        throw new Error("Missing Claude Code contract")
      }

      const result = yield* runHeadlessSession({
        agent: claude,
        cwd: "/project",
        profile: files,
        prompt: "PROMPT",
      }).pipe(Effect.provide(runner))

      expect(result).toMatchObject({ status: "timed-out", stderr: "last output" })
    })
  )

  it.effect("report a missing agent binary", () =>
    Effect.gen(function* () {
      const runner = Layer.succeed(
        CommandRunner,
        CommandRunner.make(
          () => Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          (options) => Effect.fail(new CliNotFound({ command: options.command }))
        )
      )
      const claude = codingAgents.find((agent) => agent.id === "claude")
      if (claude === undefined) {
        throw new Error("Missing Claude Code contract")
      }

      const error = yield* runHeadlessSession({
        agent: claude,
        cwd: "/project",
        profile: files,
        prompt: "PROMPT",
      }).pipe(Effect.provide(runner), Effect.flip)

      expect(error.reason).toBe("not-found")
      expect(error.cause).toEqual(new CliNotFound({ command: "claude" }))
    })
  )

  it.effect("treat untracked Git output as a dirty tree", () =>
    Effect.gen(function* () {
      const runner = Layer.succeed(
        CommandRunner,
        CommandRunner.make(
          () => Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          () =>
            Effect.succeed({
              exitCode: ChildProcessSpawner.ExitCode(0),
              status: "exited" as const,
              stderr: "",
              stdout: "?? new-file.ts\n",
            })
        )
      )

      expect(yield* checkWorkingTreeState("/project").pipe(Effect.provide(runner))).toBe("dirty")
    })
  )

  it.effect("probe both Cursor command names", () =>
    Effect.gen(function* () {
      const runner = Layer.succeed(
        CommandRunner,
        CommandRunner.make(
          () => Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          (options) =>
            options.command === "agent"
              ? Effect.fail(new CliNotFound({ command: options.command }))
              : Effect.succeed({
                  exitCode: ChildProcessSpawner.ExitCode(0),
                  status: "exited" as const,
                  stderr: "",
                  stdout: "",
                })
        )
      )

      const installed = yield* detectInstalledAgents("/project").pipe(Effect.provide(runner))
      expect(installed.find((agent) => agent.id === "cursor")?.command).toBe("cursor-agent")
    })
  )
})
