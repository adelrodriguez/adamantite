export function describe<T>(value: T): string {
  return typeof value === "string" ? value : "other"
}
