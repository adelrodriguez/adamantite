export function visit(node: object & {}) {
  return Object.keys(node)
}
