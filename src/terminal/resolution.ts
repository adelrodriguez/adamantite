import * as Console from "effect/Console"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as String from "effect/String"
import type { CodingAgent } from "#lib/handoff/coding-agents.ts"
import type { Finding } from "#lib/integrations/base.ts"
import { renderAssessmentMarkdown } from "#lib/assessment/index.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import * as Mode from "#terminal/mode.ts"
import * as Output from "#terminal/output.ts"
import { AgentSessionEnded, chooseResolution, offerPromptCopy } from "#terminal/resolution-menu.ts"

const version = getPackageVersion()

export interface Remaining {
  readonly failures: readonly string[]
  readonly findings: readonly Finding[]
  readonly warnings: readonly string[]
}

export function fromAssessment({
  findings,
  warnings,
}: Pick<Remaining, "findings" | "warnings">): Remaining {
  return { failures: [], findings, warnings }
}

type Work = { readonly _tag: "Repair"; readonly remaining: Remaining } | { readonly _tag: "Task" }

const Works = Data.taggedEnum<Work>()

export const { Repair, Task } = Works

interface Offer<E, R> {
  readonly command: "doctor" | "harden" | "init" | "update"
  readonly document: Effect.Effect<void>
  readonly message: string
  readonly prompt: string
  readonly subject: string
  readonly verify: Effect.Effect<Remaining, E, R>
  readonly work: Work
}

function hasRemaining({ failures, findings }: Remaining) {
  return failures.length > 0 || findings.length > 0
}

function isPending(work: Work) {
  return Works.$is("Repair")(work) && hasRemaining(work.remaining)
}

const printProblems = Effect.fn("printProblems")(function* (remaining: Remaining) {
  for (const warning of new Set(remaining.warnings)) {
    yield* Output.warning(warning)
  }

  for (const failure of remaining.failures) {
    yield* Output.error(failure)
  }
})

function renderFinding(finding: Finding): string {
  const sections = [
    `Current state\n${finding.currentState}`,
    `Goal\n${finding.goal.map((goal) => `• ${goal}`).join("\n")}`,
  ]

  if (finding.reference) {
    sections.push(`Reference\n${finding.reference.content.trimEnd()}`)
  }

  if (finding.notes && finding.notes.length > 0) {
    sections.push(`Notes\n${finding.notes.map((note) => `• ${note}`).join("\n")}`)
  }

  return sections.join("\n\n")
}

const printFindings = Effect.fn("printFindings")(function* (findings: readonly Finding[]) {
  for (const [index, finding] of findings.entries()) {
    yield* Output.note(`${index + 1}. ${finding.title}`, renderFinding(finding))
  }
})

function resolve<E, R>(options: Offer<E, R>) {
  const name = String.capitalize(options.command)

  const fail = Output.outro(`⚠️ ${name} found issues.`).pipe(
    Effect.andThen(
      new CommandFailed({ command: options.command, exitCode: ChildProcessSpawner.ExitCode(1) })
    )
  )

  return Effect.gen(function* () {
    if (Works.$is("Repair")(options.work)) {
      yield* printProblems(options.work.remaining)
      yield* printFindings(options.work.remaining.findings)

      if (!hasRemaining(options.work.remaining)) {
        return Option.none<CodingAgent>()
      }
    }

    const resolution = yield* chooseResolution({
      command: name,
      message: options.message,
      prompt: options.prompt,
      subject: options.subject,
    })

    if (!(resolution instanceof AgentSessionEnded)) {
      return isPending(options.work) ? yield* fail : Option.none<CodingAgent>()
    }

    const { agent } = resolution

    const remaining = yield* options.verify

    yield* printProblems(remaining)

    if (!hasRemaining(remaining)) {
      yield* Output.success(`Nothing remains to resolve after the ${agent.name} session.`)

      return Option.some(agent)
    }

    const { length } = remaining.findings

    if (length > 0) {
      yield* Output.warning(
        `${length.toLocaleString("en-US")} ${length === 1 ? "finding remains" : "findings remain"} after the ${agent.name} session.`
      )
      yield* printFindings(remaining.findings)
      yield* offerPromptCopy(renderAssessmentMarkdown(remaining, version))
    }

    return yield* fail
  }).pipe(
    Effect.catchTag("QuitError", () =>
      Output.cancel(
        isPending(options.work)
          ? `${name} was cancelled. The findings remain.`
          : `${name} was cancelled.`
      ).pipe(
        Effect.andThen(
          new CommandFailed({ command: options.command, exitCode: ChildProcessSpawner.ExitCode(1) })
        )
      )
    )
  )
}

function hasPrompt(work: Work) {
  return Works.$match(work, {
    Repair: ({ remaining }) => hasRemaining(remaining) || remaining.warnings.length > 0,
    Task: () => true,
  })
}

export function offer<E, R>(options: Offer<E, R>) {
  const unattended = isPending(options.work)
    ? Effect.fail(
        new CommandFailed({ command: options.command, exitCode: ChildProcessSpawner.ExitCode(1) })
      )
    : Effect.succeed(Option.none<CodingAgent>())

  return Effect.flatMap(Mode.CurrentMode, (mode) =>
    Mode.match(mode, {
      Json: () => Effect.andThen(options.document, unattended),
      Menu: () => resolve(options),
      Plain: () =>
        Effect.andThen(
          hasPrompt(options.work) ? Console.log(options.prompt) : Effect.void,
          unattended
        ),
    })
  )
}
