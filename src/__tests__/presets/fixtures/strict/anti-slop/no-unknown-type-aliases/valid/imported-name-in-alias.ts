import type { Payload } from "./payload"

type Envelope = { kind: "empty" } | Payload

type Reply<Payload> = Envelope | Payload[]

export type BatchReply = Reply<unknown>
