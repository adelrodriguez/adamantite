interface Bag<Value> extends Record<string, Value> {}

export function store(bag: Bag<unknown>): number {
  return Object.keys(bag).length
}
