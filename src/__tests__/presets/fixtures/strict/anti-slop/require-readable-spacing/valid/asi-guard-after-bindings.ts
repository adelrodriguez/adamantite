export function visit(first: number, second: number, report: (value: number) => void) {
  const a = first
  const b = second
  ;[a, b].forEach((value) => report(value))
}
