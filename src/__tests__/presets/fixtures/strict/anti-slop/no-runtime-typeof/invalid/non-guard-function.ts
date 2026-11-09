export function parse(value: string | number): string {
  if (typeof value !== 'string') throw new Error('not a string')
  return value
}
