import { Record } from "effect"

export const keys = Record.keys
export type Payload = globalThis.Record<string, unknown>
