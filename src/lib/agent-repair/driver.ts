import type * as Duration from "effect/Duration"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import type { CapturedCommandResult, CommandFailedLike } from "#lib/execution/command-runner.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"

export const codingAgentIds = ["claude", "codex", "cursor", "gemini", "grok", "opencode"] as const

export type CodingAgentId = (typeof codingAgentIds)[number]

export type PermissionProfile =
  | { readonly kind: "files"; readonly timeout: Duration.Input }
  | {
      readonly exactCommands?: readonly string[]
      readonly kind: "files-and-shell"
      readonly shellPrefixes: readonly string[]
      readonly timeout: Duration.Input
    }

interface HeadlessCommand {
  readonly args: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly profileEnforced: boolean
}

export interface CodingAgent {
  readonly command: string
  readonly id: CodingAgentId
  readonly minimumVersion: string
  readonly name: string
  readonly probeArguments: readonly string[]
  readonly toHeadlessCommand: (prompt: string, profile: PermissionProfile) => HeadlessCommand
}

interface CodingAgentContract extends Omit<CodingAgent, "command"> {
  readonly commands: readonly string[]
}

const fileTools = ["Read", "Edit", "Write"]

function shellTools(profile: PermissionProfile): string[] {
  return profile.kind === "files-and-shell"
    ? [
        ...profile.shellPrefixes.map((prefix) => `Bash(${prefix} *)`),
        ...(profile.exactCommands ?? []).map((command) => `Bash(${command})`),
      ]
    : []
}

function openCodePermission(profile: PermissionProfile): string {
  const bash =
    profile.kind === "files"
      ? "deny"
      : Object.fromEntries([
          ["*", "deny"],
          ...profile.shellPrefixes.map((prefix) => [`${prefix} *`, "allow"]),
          ...(profile.exactCommands ?? []).map((command) => [command, "allow"]),
        ])

  return JSON.stringify({ permission: { bash, edit: "allow", webfetch: "deny" } })
}

// Contract provenance (2026-09-16): these headless forms and permission flags were checked against
// Claude Code 2.1.272, Codex 0.154.0, Grok Build 1.0.30, and OpenCode 1.18.31. Gemini and Cursor
// use their first-party documentation. Recheck an entry when its CLI reaches a new major version.
const contracts: readonly CodingAgentContract[] = [
  {
    commands: ["claude"],
    id: "claude",
    minimumVersion: "2.1.272",
    name: "Claude Code",
    probeArguments: ["--version"],
    toHeadlessCommand: (prompt, profile) => ({
      args: [
        "-p",
        prompt,
        "--permission-prompts",
        "none",
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        [...fileTools, ...shellTools(profile)].join(" "),
      ],
      profileEnforced: true,
    }),
  },
  {
    commands: ["codex"],
    id: "codex",
    minimumVersion: "0.154.0",
    name: "Codex",
    probeArguments: ["--version"],
    toHeadlessCommand: (prompt) => ({
      args: ["exec", "--sandbox", "workspace-write", prompt],
      profileEnforced: false,
    }),
  },
  {
    commands: ["agent", "cursor-agent"],
    id: "cursor",
    minimumVersion: "2026.09",
    name: "Cursor",
    probeArguments: ["--version"],
    toHeadlessCommand: (prompt) => ({
      args: ["-p", prompt, "--trust", "--force"],
      profileEnforced: false,
    }),
  },
  {
    commands: ["gemini"],
    id: "gemini",
    minimumVersion: "0.8.0",
    name: "Gemini CLI",
    probeArguments: ["--version"],
    toHeadlessCommand: (prompt, profile) => ({
      args: [
        "-p",
        prompt,
        "--approval-mode",
        "auto_edit",
        "--allowed-tools",
        [
          "read_file",
          "write_file",
          "replace",
          ...shellTools(profile).map((tool) => `ShellTool(${tool.slice(5, -1)})`),
        ].join(","),
      ],
      profileEnforced: true,
    }),
  },
  {
    commands: ["grok"],
    id: "grok",
    minimumVersion: "1.0.30",
    name: "Grok Build",
    probeArguments: ["version"],
    toHeadlessCommand: (prompt, profile) => ({
      args: [
        "-p",
        prompt,
        "--permission-mode",
        "acceptEdits",
        "--sandbox",
        "workspace",
        ...shellTools(profile).flatMap((tool) => ["--allow", tool]),
      ],
      profileEnforced: true,
    }),
  },
  {
    commands: ["opencode"],
    id: "opencode",
    minimumVersion: "1.18.31",
    name: "OpenCode",
    probeArguments: ["--version"],
    toHeadlessCommand: (prompt, profile) => ({
      args: ["run", prompt],
      env: { OPENCODE_CONFIG_CONTENT: openCodePermission(profile) },
      profileEnforced: true,
    }),
  },
]

function withCommand(contract: CodingAgentContract, command: string): CodingAgent {
  return {
    command,
    id: contract.id,
    minimumVersion: contract.minimumVersion,
    name: contract.name,
    probeArguments: contract.probeArguments,
    toHeadlessCommand: contract.toHeadlessCommand,
  }
}

export const codingAgents: readonly CodingAgent[] = contracts.map((contract) =>
  withCommand(contract, contract.commands[0] ?? contract.id)
)

export function getCodingAgent(id: CodingAgentId): CodingAgent {
  const contract = contracts.find((candidate) => candidate.id === id)

  if (contract === undefined) {
    throw new Error(`Unknown coding agent: ${id}`)
  }

  return withCommand(contract, contract.commands[0] ?? contract.id)
}

// A probe counts as installed when it starts, regardless of its exit code. Missing commands,
// spawn failures, and probes that exceed ten seconds do not count.
export const detectInstalledAgents = (cwd: string) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner
    const probes = yield* Effect.forEach(
      contracts,
      (contract) =>
        Effect.gen(function* () {
          for (const command of contract.commands) {
            const started = yield* runner
              .capture({ args: [...contract.probeArguments], command, cwd, timeout: "10 seconds" })
              .pipe(
                Effect.as(true),
                Effect.catch(() => Effect.succeed(false))
              )

            if (started) {
              return withCommand(contract, command)
            }
          }

          return null
        }),
      { concurrency: contracts.length }
    )
    return probes.filter((agent) => agent !== null)
  })

export class AgentSessionFailed extends Data.TaggedError("AgentSessionFailed")<{
  readonly cause: CommandFailedLike
  readonly reason: "not-found" | "spawn-failed"
}> {}

export type HeadlessSessionResult = CapturedCommandResult & {
  readonly minimumVersion: string
  readonly profileEnforced: boolean
}

export const runHeadlessSession = ({
  agent,
  cwd,
  profile,
  prompt,
}: {
  readonly agent: CodingAgent
  readonly cwd: string
  readonly profile: PermissionProfile
  readonly prompt: string
}) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner
    const command = agent.toHeadlessCommand(prompt, profile)
    const run = (commandName: string) =>
      runner.capture({
        args: [...command.args],
        captureStdout: false,
        command: commandName,
        cwd,
        env: command.env,
        stderrLimitBytes: 64 * 1024,
        timeout: profile.timeout,
      })
    const result = yield* run(agent.command).pipe(
      Effect.catchTag("CliNotFound", (error) =>
        agent.id === "cursor" && agent.command === "agent"
          ? run("cursor-agent")
          : Effect.fail(error)
      )
    )

    return {
      ...result,
      minimumVersion: agent.minimumVersion,
      profileEnforced: command.profileEnforced,
    } satisfies HeadlessSessionResult
  }).pipe(
    Effect.mapError(
      (error) =>
        new AgentSessionFailed({
          cause: error,
          reason: error._tag === "CliNotFound" ? "not-found" : "spawn-failed",
        })
    )
  )

export type WorkingTreeState = "clean" | "dirty" | "unknown"

export const checkWorkingTreeState = (cwd: string) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner
    const result = yield* runner.capture({
      args: ["status", "--porcelain"],
      command: "git",
      cwd,
      timeout: "10 seconds",
    })

    if (result.status !== "exited" || result.exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return "unknown" as const
    }

    return result.stdout.length === 0 ? ("clean" as const) : ("dirty" as const)
  }).pipe(Effect.catch(() => Effect.succeed<WorkingTreeState>("unknown")))
