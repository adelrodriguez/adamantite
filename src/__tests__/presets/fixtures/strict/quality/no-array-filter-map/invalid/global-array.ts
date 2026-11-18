export function collect(values: globalThis.ReadonlyArray<string>) {
  return values.map((value) => value.trim()).filter((value) => value.length > 0)
}
