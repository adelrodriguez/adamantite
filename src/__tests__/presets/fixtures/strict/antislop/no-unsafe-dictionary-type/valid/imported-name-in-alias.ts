import type { Payload } from "../modules/payload"

type Envelope = Payload

type Replies<Payload> = Record<string, Envelope | Payload[]>

export type Batch = Replies<unknown>
