export function collect(values: readonly string[]) {
  return values.map((value) => value.trim()).filter((value) => value.length > 0)
}
