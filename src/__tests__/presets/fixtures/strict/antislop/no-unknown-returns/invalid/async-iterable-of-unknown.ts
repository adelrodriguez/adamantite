declare const events: AsyncIterable<string>

export function stream(): AsyncIterable<unknown> {
  return events
}
