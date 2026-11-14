export function isPresent<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined
}

export function isText(value: unknown): value is string {
  return typeof value === "string"
}
