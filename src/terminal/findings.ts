import * as Effect from "effect/Effect"
import type { Finding } from "#lib/integrations/base.ts"
import { Prompter } from "#terminal/prompter.ts"

export function printFindings(findings: readonly Finding[]) {
  return Effect.gen(function* () {
    const prompter = yield* Prompter

    for (const [index, finding] of findings.entries()) {
      yield* prompter.log.warning(`${index + 1}. ${finding.title}`)
      yield* prompter.log.info(`Current state: ${finding.currentState}`)

      for (const goal of finding.goal) {
        yield* prompter.log.info(`Goal: ${goal}`)
      }

      if (finding.reference) {
        yield* prompter.log.info(`Reference:\n${finding.reference.trimEnd()}`)
      }

      for (const note of finding.notes ?? []) {
        yield* prompter.log.info(`Note: ${note}`)
      }
    }
  })
}
