type Payload = Record<string, unknown>

export function readName(payload: Payload): string {
  return typeof payload.name === "string" ? payload.name : "anonymous"
}
