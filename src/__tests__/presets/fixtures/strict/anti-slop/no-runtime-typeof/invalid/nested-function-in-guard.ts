export function isString(value: unknown): value is string {
  const check = () => typeof value === 'string'
  return check()
}
