import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

/**
 * An environment variable that tells Oxlint it runs in a coding agent, and the test of its value.
 */
interface AgentSignal {
  readonly matches: (value: string) => boolean
  readonly variable: string
}

function hasValue(variable: string): AgentSignal {
  return { matches: (value) => value !== "", variable }
}

function contains(variable: string, ...needles: readonly string[]): AgentSignal {
  return { matches: (value) => needles.some((needle) => value.includes(needle)), variable }
}

/**
 * The signals of Oxlint's agent detection, from `apps/oxlint/src/agent_detection.rs`:
 * https://github.com/oxc-project/oxc/blob/8c2abc4c86974ae5c9604a48e6d98e02bd3ba5a2/apps/oxlint/src/agent_detection.rs
 * Update the list when an Oxlint update changes that file.
 */
const AGENT_SIGNALS: readonly AgentSignal[] = [
  hasValue("AI_AGENT"),
  hasValue("CLAUDECODE"),
  hasValue("CLAUDE_CODE"),
  hasValue("REPL_ID"),
  hasValue("GEMINI_CLI"),
  hasValue("CODEX_SANDBOX"),
  hasValue("CODEX_THREAD_ID"),
  hasValue("COPILOT_CLI"),
  hasValue("OPENCODE"),
  hasValue("JUNIE_DATA"),
  hasValue("JUNIE_SHIM_PATH"),
  contains("PATH", ".pi/agent", String.raw`.pi\agent`),
  contains("EDITOR", "devin"),
  hasValue("CURSOR_AGENT"),
  contains("TERM_PROGRAM", "kiro"),
]

/**
 * Whether Oxlint prints its agent report, which has one line for each report and nothing for a
 * passing lint, because the environment names a coding agent.
 */
export const printsAgentReport = Effect.findFirst(AGENT_SIGNALS, ({ matches, variable }) =>
  Config.String(variable).pipe(
    Config.withDefault(""),
    Effect.map(matches),
    // Any string decodes, and the default covers a missing variable, so only a provider that
    // cannot read its source fails. That failure is a defect.
    Effect.orDie
  )
).pipe(Effect.map(Option.isSome))
