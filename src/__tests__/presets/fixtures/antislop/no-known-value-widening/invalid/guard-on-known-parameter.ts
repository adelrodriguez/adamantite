function isString(value: unknown): value is string {
  return true
}
export function check(known: string): boolean {
  return isString(known)
}
