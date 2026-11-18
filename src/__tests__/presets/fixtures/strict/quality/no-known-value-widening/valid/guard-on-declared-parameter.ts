function isString(value: unknown): value is string {
  return typeof value === "string"
}

export function check(known: string): boolean {
  return isString(known)
}
