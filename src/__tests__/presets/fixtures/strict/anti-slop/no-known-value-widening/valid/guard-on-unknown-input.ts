function isString(value: unknown): value is string {
  return typeof value === "string"
}

declare const input: unknown

export const result = isString(input)
