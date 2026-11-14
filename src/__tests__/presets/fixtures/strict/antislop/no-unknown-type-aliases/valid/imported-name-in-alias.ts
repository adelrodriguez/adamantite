import type { Payload } from "../modules/payload"

type Envelope = { kind: "empty" } | Payload

type Reply<Payload> = Envelope | Payload[]

export type BatchReply = Reply<unknown>
