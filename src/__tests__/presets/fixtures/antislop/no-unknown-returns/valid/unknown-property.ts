declare const input: string
export function cause(): { cause: unknown } {
  return { cause: input }
}
