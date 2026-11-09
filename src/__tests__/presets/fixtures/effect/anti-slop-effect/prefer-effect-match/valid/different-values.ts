export function label(kind: string, other: string) {
  return kind === "a" ? "first" : other === "b" ? "second" : "other"
}
