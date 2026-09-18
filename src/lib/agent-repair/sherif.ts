import * as Effect from "effect/Effect"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"

export interface SherifDiagnostic {
  readonly file: string
  readonly message: string
  readonly raw: string
  readonly type: "sherif"
}

// Sherif has no machine-readable reporter, so a failed run is one project-wide diagnostic.
export const collectSherifDiagnostics = Effect.fn("collectSherifDiagnostics")(function* ({
  args,
  cwd,
}: {
  readonly args: readonly string[]
  readonly cwd: string
}) {
  const runner = yield* CommandRunner
  const result = yield* runner.capture({ args: [...args], command: sherif.name, cwd })

  if (result.status === "exited" && result.exitCode === 0) {
    return []
  }

  const output = `${result.stdout}\n${result.stderr}`.trim()
  return [
    {
      file: cwd,
      message: output || "Sherif reported monorepo consistency issues.",
      raw: output,
      type: "sherif",
    },
  ] satisfies SherifDiagnostic[]
})
