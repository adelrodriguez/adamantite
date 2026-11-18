function isString(value: unknown): value is string {
  return typeof value === "string"
}

export function label(input: string | number): string {
  return isString(input) ? input : input.toFixed(2)
}
