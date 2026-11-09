export function label(kind: "a" | "b" | "c") {
  return kind === "a" ? "first" : kind === "b" ? "second" : "other"
}
