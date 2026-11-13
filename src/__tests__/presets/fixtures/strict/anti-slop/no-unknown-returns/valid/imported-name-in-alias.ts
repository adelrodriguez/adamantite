import type { Payload } from "./payload"

type Envelope = { kind: "empty" } | Payload

type Reply<Payload> = Envelope | Payload[]

declare const reply: Reply<unknown>

export function load(): Reply<unknown> {
  return reply
}
