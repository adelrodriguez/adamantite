// oxlint-disable-next-line antislop/no-unsafe-dictionary-type -- each caller adds its own log fields
type LogFields = Record<string, unknown>

export type Logger = {
  debug: (event: LogFields) => void
  info: (event: LogFields) => void
  warn: (event: LogFields) => void
  error: (event: LogFields) => void
}
