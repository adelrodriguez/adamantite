export function describe<T extends number | string>(value: T): string {
  return typeof value === "string" ? value : value.toFixed(2)
}
