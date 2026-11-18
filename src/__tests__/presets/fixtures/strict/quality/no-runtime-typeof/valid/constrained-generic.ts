export function pick<T extends number | string>(value: T, fallback: T): T {
  return typeof value === "string" ? value : fallback
}
