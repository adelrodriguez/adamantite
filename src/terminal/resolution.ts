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

/**
 * What is left to resolve: the findings, the checks that failed, and the warnings that come with
 * them. Nothing remains when there is no finding and no failure.
 */
export interface Remaining {
  readonly failures: readonly string[]
  readonly findings: readonly Finding[]
  readonly warnings: readonly string[]
}

/**
 * The findings and warnings of an assessment, as what remains.
 */
export function fromAssessment({
  findings,
  warnings,
}: Pick<Remaining, "findings" | "warnings">): Remaining {
  return { failures: [], findings, warnings }
}

/**
 * What a command hands to an agent. A `Repair` resolves what remains, and the command fails while
 * something remains. A `Task`, such as harden, is work that the user can decline.
 */
type Work = { readonly _tag: "Repair"; readonly remaining: Remaining } | { readonly _tag: "Task" }

const Works = Data.taggedEnum<Work>()

export const { Repair, Task } = Works

interface Offer<E, R> {
  /**
   * The command, such as `doctor`. The menu and its lines name it, as in "Exit the agent to return
   * to Doctor."
   */
  readonly command: "doctor" | "harden" | "init" | "update"
  readonly cwd: string
  /**
   * Prints the JSON document of `--json`, such as `Output.json(Report, report)`.
   */
  readonly document: Effect.Effect<void>
  /**
   * The question of the resolution menu.
   */
  readonly message: string
  /**
   * The Markdown prompt that the agent gets, and that a run without a terminal prints.
   */
  readonly prompt: string
  /**
   * What the command hands off, such as `findings`, in "Doctor can hand findings off when…"
   */
  readonly subject: string
  /**
   * Reads the project again after an agent session, and returns what remains.
   */
  readonly verify: Effect.Effect<Remaining, E, R>
  readonly work: Work
}

function hasRemaining({ failures, findings }: Remaining) {
  return failures.length > 0 || findings.length > 0
}

function isPending(work: Work) {
  return Works.$is("Repair")(work) && hasRemaining(work.remaining)
}

// The warnings and the failures, without the findings.
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

// Each finding as a numbered note.
const printFindings = Effect.fn("printFindings")(function* (findings: readonly Finding[]) {
  for (const [index, finding] of findings.entries()) {
    yield* Output.note(`${index + 1}. ${finding.title}`, renderFinding(finding))
  }
})

/**
 * The resolution menu, then the handoff and its verification. It returns the agent whose session
 * left nothing to resolve, or none when no agent session ran.
 */
const resolve = <E, R>(options: Offer<E, R>) => {
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
      cwd: options.cwd,
      message: options.message,
      prompt: options.prompt,
      subject: options.subject,
    })

    if (!(resolution instanceof AgentSessionEnded)) {
      return isPending(options.work) ? yield* fail : Option.none<CodingAgent>()
    }

    const { agent } = resolution

    // The agent's exit code does not decide the result. The project after the session does.
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

// A repair with only warnings still prints its warning report.
function hasPrompt(work: Work) {
  return Works.$match(work, {
    Repair: ({ remaining }) => hasRemaining(remaining) || remaining.warnings.length > 0,
    Task: () => true,
  })
}

/**
 * Hands the prompt of a command to a coding agent, the one way that a command does. The mode of the
 * command decides how: `--json` prints the JSON document, a terminal shows the resolution menu, and
 * any other run prints the Markdown prompt. After an agent session it runs `verify`, and the
 * command succeeds only when nothing remains. An agent CLI that does not start leaves the prompt
 * printed instead. The command fails while a `Repair` has something left. It returns the agent
 * whose session left nothing to resolve, or none when no agent session ran.
 */
export const offer = <E, R>(options: Offer<E, R>) => {
  // Without a menu, nothing hands off, so the work stays as the command found it.
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
