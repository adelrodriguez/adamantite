import { styleText } from "node:util"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"

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

// Continuation lines start under the text, after the symbol and its space.
const renderStatus = (status: Status, message: string) =>
  Effect.map(
    style(STATUSES[status].color, STATUSES[status].symbol),
    (symbol) => `${symbol} ${message.replaceAll("\n", "\n  ")}`
  )

const log = (status: Status) => (message: string) =>
  Effect.flatMap(renderStatus(status, message), (line) => Console.log(line))

export const info = log("info")

export const success = log("success")

export const warning = log("warning")

export const error = log("error")

/**
 * Reports that the user cancelled the command, such as with Ctrl-C at a prompt.
 */
export const cancel = log("cancel")

/**
 * Reports the error that ended the command, on standard error. Every other line goes to standard
 * output, so the lines and the prompts keep their order.
 */
export const failure = (message: string) =>
  Effect.flatMap(renderStatus("error", message), (line) => Console.error(line))

const heading = (text: string) => Effect.flatMap(style("bold", text), (line) => Console.log(line))

/**
 * Names the command at the start of its output, such as `💠 adamantite init`.
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
    Console.log(`\n${styledTitle}\n${body.replaceAll(/^(?=.)/gmu, "  ")}`)
  )
