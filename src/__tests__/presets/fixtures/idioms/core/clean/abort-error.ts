export class AbortError extends Error {
  override name = "AbortError"
}

export function cancel(signal?: AbortSignal) {
  signal?.throwIfAborted()
}
