export function visit(first: number, second: number, report: (value: number) => number) {
  const a = first
  const b = second
  ;[a, b].forEach((value) => report(value))
}
