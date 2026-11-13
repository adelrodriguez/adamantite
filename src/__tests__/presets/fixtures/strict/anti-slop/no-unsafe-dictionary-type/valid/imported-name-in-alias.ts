import type { Payload } from "./payload"

type Envelope = Payload

type Replies<Payload> = Record<string, Envelope | Payload[]>

export type Batch = Replies<unknown>
