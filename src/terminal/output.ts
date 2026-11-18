import { styleText } from "node:util"
import * as Cause from "effect/Cause"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import { CommandFailed } from "#lib/shared/errors.ts"
import { CurrentMode, is } from "#terminal/mode.ts"

/**
 * The status of a line, with the symbol and color that mark it. The symbols match the prompts of
 * `effect/cli/Prompt`, which mark an answer with `✔`.
 */
const STATUSES = {
  cancel: { color: "red", symbol: "■" },
  error: { color: "red", symbol: "✖" },
  info: { color: "blue", symbol: "●" },
  success: { color: "green", symbol: "✔" },
  warning: { color: "yellow", symbol: "▲" },
} as const satisfies Record<
  string,
  { readonly color: Parameters<typeof styleText>[0]; readonly symbol: string }
>

type Status = keyof typeof STATUSES

const style = (format: Parameters<typeof styleText>[0], text: string) =>
  Effect.map(TerminalCapabilities.TerminalCapabilities, ({ canColor }) =>
    canColor ? styleText(format, text, { validateStream: false }) : text
  )

// Continuation lines start under the text, after the symbol and its space. A blank line stays empty.
const renderStatus = (status: Status, message: string) =>
  Effect.map(
    style(STATUSES[status].color, STATUSES[status].symbol),
    (symbol) => `${symbol} ${message.replaceAll(/\n(?=.)/gu, "\n  ")}`
  )

/**
 * Writes a line on standard output, or on standard error in the JSON mode, where standard output
 * holds only the JSON document.
 */
const write = (line: string) =>
  Effect.flatMap(CurrentMode, (mode) =>
    is("Json")(mode) ? Console.error(line) : Console.log(line)
  )

const log = (status: Status) => (message: string) =>
  Effect.flatMap(renderStatus(status, message), write)

export const info = log("info")

export const success = log("success")

export const warning = log("warning")

export const error = log("error")

/**
 * Reports that the user quit a prompt, such as with Ctrl-C. A quit prompt of `effect/cli/Prompt`
 * 4.1.2 leaves the cursor at the end of its last line, so the line starts with a line break.
 */
export const cancel = (message: string) =>
  Effect.flatMap(renderStatus("cancel", message), (line) => write(`\n${line}`))

/**
 * Reports the error that ended the command, on standard error. Every other line goes to standard
 * output, so the lines and the prompts keep their order.
 */
export const failure = (message: string) =>
  Effect.flatMap(renderStatus("error", message), (line) => Console.error(line))

/**
 * Reports each error that ended the command, in order, and returns the exit code of the first. A
 * command can fail for several reasons, such as a stage that did not start and a setup to update,
 * and each one needs its repair. A `CommandFailed` prints no line, because its command already
 * printed its report, and its exit code stands.
 */
export const failures = Effect.fn("Output.failures")(function* (
  cause: Cause.Cause<{ readonly message: string }>
) {
  const errors = cause.reasons
    .filter((reason) => Cause.isFailReason(reason))
    .map(({ error }) => error)

  yield* Effect.forEach(
    errors,
    (error) => (error instanceof CommandFailed ? Effect.void : failure(error.message)),
    { concurrency: 1, discard: true }
  )

  const [first] = errors

  return first instanceof CommandFailed ? first.exitCode : ChildProcessSpawner.ExitCode(1)
})

// A heading frames an interactive session, so the other modes print none.
const heading = (text: string) =>
  Effect.flatMap(CurrentMode, (mode) =>
    is("Menu")(mode)
      ? Effect.flatMap(style("bold", text), (line) => Console.log(line))
      : Effect.void
  )

/**
 * Names the command at the start of its output, such as `💠 adamantite init`. Only a command that
 * asks in a terminal prints it.
 */
export const intro = heading

/**
 * States the outcome of the command at the end of its output.
 */
export const outro = heading

/**
 * A titled block, such as a finding. A blank line separates it from the line above, and its body is
 * indented under the title.
 */
export const note = (title: string, body: string) =>
  Effect.flatMap(style("bold", title), (styledTitle) =>
    write(`\n${styledTitle}\n${body.replaceAll(/^(?=.)/gmu, "  ")}`)
  )

/**
 * Prints `value` as the one JSON document of the command, on standard output with two-space
 * indentation. The schema is the contract that agents and tests decode it with.
 */
export const json = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: S["Type"]) =>
  Schema.encodeEffect(Schema.fromJsonString(schema, { space: 2 }))(value).pipe(
    // The command builds the value from its own schema, so a value that does not encode is a defect.
    Effect.orDie,
    Effect.flatMap((text) => Console.log(text))
  )

/**
 * Prints the result of a command that hands nothing off: the JSON document of `value` in the JSON
 * mode, and `text` in the other modes.
 */
export const result = <S extends Schema.Codec<unknown, unknown>>(
  schema: S,
  value: S["Type"],
  text: string
) =>
  Effect.flatMap(CurrentMode, (mode) =>
    is("Json")(mode) ? json(schema, value) : Console.log(text)
  )
