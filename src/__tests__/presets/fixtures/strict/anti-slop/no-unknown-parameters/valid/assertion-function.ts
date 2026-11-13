export function assertString(value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError("The value is not a string.")
  }
}
