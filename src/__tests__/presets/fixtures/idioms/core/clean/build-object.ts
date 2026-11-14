export function buildObject(names: string[]) {
  return Object.fromEntries(names.map((name) => [name, name.length]))
}

export function mergeOptions(items: Array<{ retries: number }>) {
  return items.reduce((previous, current) => Object.assign(previous, current), { retries: 0 })
}
