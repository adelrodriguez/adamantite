export function label(kind: "a" | "b" | "c") {
  return "a" !== kind ? "not first" : "b" === kind ? "second" : "other"
}
