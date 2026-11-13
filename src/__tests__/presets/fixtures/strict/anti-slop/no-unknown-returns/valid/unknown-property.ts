interface Failure {
  readonly cause: unknown
}

declare const input: unknown

export function fail(): Failure {
  return { cause: input }
}
