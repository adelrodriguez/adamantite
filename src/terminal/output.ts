import { styleText } from "node:util"
import * as Cause from "effect/Cause"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import { CommandFailed } from "#lib/shared/errors.ts"
import { CurrentMode, is } from "#terminal/mode.ts"

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

const renderStatus = (status: Status, message: string) =>
  Effect.map(
    style(STATUSES[status].color, STATUSES[status].symbol),
    (symbol) => `${symbol} ${message.replaceAll(/\n(?=.)/gu, "\n  ")}`
  )

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

// A quit prompt of `effect/cli/Prompt` 4.1.2 leaves the cursor at the end of its last line.
export const cancel = (message: string) =>
  Effect.flatMap(renderStatus("cancel", message), (line) => write(`\n${line}`))

export const failure = (message: string) =>
  Effect.flatMap(renderStatus("error", message), (line) => Console.error(line))

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

const heading = (text: string) =>
  Effect.flatMap(CurrentMode, (mode) =>
    is("Menu")(mode)
      ? Effect.flatMap(style("bold", text), (line) => Console.log(line))
      : Effect.void
  )

export const intro = heading

export const outro = heading

export const note = (title: string, body: string) =>
  Effect.flatMap(style("bold", title), (styledTitle) =>
    write(`\n${styledTitle}\n${body.replaceAll(/^(?=.)/gmu, "  ")}`)
  )

export const json = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: S["Type"]) =>
  Schema.encodeEffect(Schema.fromJsonString(schema, { space: 2 }))(value).pipe(
    Effect.orDie,
    Effect.flatMap((text) => Console.log(text))
  )

export const result = <S extends Schema.Codec<unknown, unknown>>(
  schema: S,
  value: S["Type"],
  text: string
) =>
  Effect.flatMap(CurrentMode, (mode) =>
    is("Json")(mode) ? json(schema, value) : Console.log(text)
  )
