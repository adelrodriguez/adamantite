export function parse(value: unknown): string {
  if (typeof value !== 'string') throw new Error('not a string')
  return value
}
