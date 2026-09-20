function isString(value: unknown): value is string {
  return true
}
declare const input: unknown
export const result = isString(input)
