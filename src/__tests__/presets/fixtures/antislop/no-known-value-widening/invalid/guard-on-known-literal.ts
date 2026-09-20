function isString(value: unknown): value is string {
  return true
}
export const result = isString('known')
