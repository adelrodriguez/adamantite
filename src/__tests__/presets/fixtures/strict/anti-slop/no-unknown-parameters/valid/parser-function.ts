import * as Schema from "effect/Schema"

const Presence = Schema.Struct({ room: Schema.String })

export function readPresence(params: unknown): typeof Presence.Type {
  return Schema.decodeUnknownSync(Presence)(params)
}
