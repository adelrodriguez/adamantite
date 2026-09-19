import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Struct from "effect/Struct"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import type { RepairAttemptOutcome } from "#lib/agent-repair/loop.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"

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
}

interface CodingAgentContract {
  /**
   * Executable names, tried in order.
   */
  readonly commands: readonly string[]
  /**
   * False when the CLI has no flags that restrict the agent to the permission profile.
   */
  readonly enforcesPermissions: boolean
  readonly minimumVersion: string
  readonly name: string
  readonly probeArguments: readonly string[]
  /**
   * Required in the probe output when another CLI can own one of the command names.
   */
  readonly probePattern?: RegExp
  readonly toHeadlessCommand: (prompt: string, profile: PermissionProfile) => HeadlessCommand
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

// Gemini CLI matches a shell rule as a command prefix, so a rule has no wildcard.
function geminiShellTools(profile: PermissionProfile): string[] {
  return profile.kind === "files-and-shell"
    ? [...profile.shellPrefixes, ...(profile.exactCommands ?? [])].map(
        (command) => `run_shell_command(${command})`
      )
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
const CODING_AGENT_CONTRACTS = {
  claude: {
    commands: ["claude"],
    enforcesPermissions: true,
    minimumVersion: "2.1.272",
    name: "Claude Code",
    probeArguments: ["--version"],
    toHeadlessCommand: (prompt, profile) => ({
      args: [
        "-p",
        prompt,
        "--permission-prompts",
        "none",
        // `acceptEdits` also approves `rm`, `mv`, and other filesystem commands. `dontAsk` denies
        // each tool that the allowlist does not name.
        "--permission-mode",
        "dontAsk",
        "--allowedTools",
        [...fileTools, ...shellTools(profile)].join(" "),
      ],
    }),
  },
  codex: {
    commands: ["codex"],
    enforcesPermissions: false,
    minimumVersion: "0.154.0",
    name: "Codex",
    probeArguments: ["--version"],
    toHeadlessCommand: (prompt) => ({
      args: ["exec", "--sandbox", "workspace-write", prompt],
    }),
  },
  cursor: {
    commands: ["cursor-agent", "agent"],
    enforcesPermissions: false,
    minimumVersion: "2026.09",
    name: "Cursor",
    probeArguments: ["--version"],
    // Other CLIs also install an `agent` command. Cursor versions are dates, such as `2026.09.12`.
    probePattern: /^\d{4}\.\d{2}\./u,
    toHeadlessCommand: (prompt) => ({
      args: ["-p", prompt, "--trust", "--force"],
    }),
  },
  gemini: {
    commands: ["gemini"],
    enforcesPermissions: true,
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
        ["read_file", "write_file", "replace", ...geminiShellTools(profile)].join(","),
      ],
    }),
  },
  grok: {
    commands: ["grok"],
    enforcesPermissions: true,
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
    }),
  },
  opencode: {
    commands: ["opencode"],
    enforcesPermissions: true,
    minimumVersion: "1.18.31",
    name: "OpenCode",
    probeArguments: ["--version"],
    toHeadlessCommand: (prompt, profile) => ({
      args: ["run", prompt],
      env: { OPENCODE_CONFIG_CONTENT: openCodePermission(profile) },
    }),
  },
} satisfies Record<string, CodingAgentContract>

export type CodingAgentId = keyof typeof CODING_AGENT_CONTRACTS

export interface CodingAgent extends CodingAgentContract {
  readonly id: CodingAgentId
}

export const CODING_AGENT_IDS = Struct.keys(CODING_AGENT_CONTRACTS)

export function getCodingAgent(id: CodingAgentId): CodingAgent {
  return { ...CODING_AGENT_CONTRACTS[id], id }
}

// A probe counts as installed when it starts and its output matches the probe pattern, regardless
// of its exit code. Missing commands, spawn failures, and probes that exceed ten seconds do not
// count. A detected agent keeps only the command that started.
export const detectAgent = (id: CodingAgentId, cwd: string) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner
    const agent = getCodingAgent(id)

    for (const command of agent.commands) {
      const installed = yield* runner
        .capture({ args: [...agent.probeArguments], command, cwd, timeout: "10 seconds" })
        .pipe(
          Effect.map(
            (probe) =>
              probe.status === "exited" && (agent.probePattern?.test(probe.stdout.trim()) ?? true)
          ),
          Effect.catch(() => Effect.succeed(false))
        )

      if (installed) {
        return { ...agent, commands: [command] } satisfies CodingAgent
      }
    }

    return null
  })

export const detectInstalledAgents = (cwd: string) =>
  Effect.forEach(CODING_AGENT_IDS, (id) => detectAgent(id, cwd), {
    concurrency: CODING_AGENT_IDS.length,
  }).pipe(Effect.map((agents) => agents.filter((agent) => agent !== null)))

export function renderAgentNotFound(agent: CodingAgent): string {
  const commands = agent.commands.map((command) => `\`${command}\``).join(" or ")
  return `${commands} was not found. ${agent.name} ${agent.minimumVersion} or later is required.`
}

/**
 * Runs one headless agent session. The session never fails: a missing CLI, a spawn failure, a
 * timeout, and a nonzero exit each become the note of the outcome.
 */
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
}): Effect.Effect<RepairAttemptOutcome, never, CommandRunner> =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner
    const headless = agent.toHeadlessCommand(prompt, profile)

    for (const command of agent.commands) {
      const session = yield* runner
        .capture({
          args: [...headless.args],
          captureStdout: false,
          command,
          cwd,
          env: headless.env,
          stderrLimitBytes: 64 * 1024,
          timeout: profile.timeout,
        })
        .pipe(Effect.catchTag("CliNotFound", () => Effect.succeed(null)))

      if (session !== null) {
        if (session.status === "timed-out") {
          return { note: "The agent attempt timed out." }
        }
        if (session.exitCode !== ChildProcessSpawner.ExitCode(0)) {
          return { note: session.stderr || `${agent.name} exited with code ${session.exitCode}.` }
        }
        return {}
      }
    }

    return { note: renderAgentNotFound(agent) }
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({ note: `Failed to start ${agent.name}: ${error.message}` })
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
