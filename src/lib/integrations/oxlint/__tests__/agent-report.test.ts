import { describe, expect, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import { printsAgentReport } from "#lib/integrations/oxlint/agent-report.ts"

/**
 * Whether Oxlint prints its agent report with the environment `env`.
 */
function printsAgentReportWith(env: Readonly<Record<string, string>>) {
  return printsAgentReport.pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(env))
  )
}

interface Case {
  readonly env: Readonly<Record<string, string>>
  readonly name: string
}

const DETECTED: readonly Case[] = [
  { env: { PATH: "/usr/bin:/home/me/.pi/agent/bin" }, name: "a Pi folder on PATH" },
  {
    env: { PATH: String.raw`C:\Windows;C:\Users\me\.pi\agent\bin` },
    name: "a Pi folder on a Windows PATH",
  },
  { env: { EDITOR: "/usr/local/bin/devin" }, name: "Devin as the editor" },
  { env: { TERM_PROGRAM: "kiro" }, name: "Kiro as the terminal program" },
]

const NOT_DETECTED: readonly Case[] = [
  { env: {}, name: "no agent variable" },
  { env: { CLAUDECODE: "", CURSOR_AGENT: "" }, name: "agent variables without a value" },
  { env: { EDITOR: "vim", PATH: "/usr/bin", TERM_PROGRAM: "iTerm.app" }, name: "a plain terminal" },
]

describe("printsAgentReport", () => {
  it.effect.each([
    "AI_AGENT",
    "CLAUDECODE",
    "CLAUDE_CODE",
    "REPL_ID",
    "GEMINI_CLI",
    "CODEX_SANDBOX",
    "CODEX_THREAD_ID",
    "COPILOT_CLI",
    "OPENCODE",
    "JUNIE_DATA",
    "JUNIE_SHIM_PATH",
    "CURSOR_AGENT",
  ])("detect an agent when %s has a value", (variable) =>
    Effect.gen(function* () {
      expect(yield* printsAgentReportWith({ [variable]: "1" })).toBe(true)
    })
  )

  it.effect.each(DETECTED)("detect an agent from $name", ({ env }) =>
    Effect.gen(function* () {
      expect(yield* printsAgentReportWith(env)).toBe(true)
    })
  )

  it.effect.each(NOT_DETECTED)("detect no agent with $name", ({ env }) =>
    Effect.gen(function* () {
      expect(yield* printsAgentReportWith(env)).toBe(false)
    })
  )
})
