import * as Effect from "effect/Effect"
import type { Finding } from "#lib/integrations/base.ts"
import { Prompter } from "#terminal/prompter.ts"

function renderFinding(finding: Finding): string {
  const sections = [
    `Current state\n${finding.currentState}`,
    `Goal\n${finding.goal.map((goal) => `• ${goal}`).join("\n")}`,
  ]

  if (finding.reference) {
    sections.push(`Reference\n${finding.reference.trimEnd()}`)
  }

  if (finding.notes && finding.notes.length > 0) {
    sections.push(`Notes\n${finding.notes.map((note) => `• ${note}`).join("\n")}`)
  }

  return sections.join("\n\n")
}

export const printFindings = Effect.fn("printFindings")(function* (findings: readonly Finding[]) {
  const prompter = yield* Prompter

  for (const [index, finding] of findings.entries()) {
    yield* prompter.note(renderFinding(finding), `${index + 1}. ${finding.title}`)
  }
})
