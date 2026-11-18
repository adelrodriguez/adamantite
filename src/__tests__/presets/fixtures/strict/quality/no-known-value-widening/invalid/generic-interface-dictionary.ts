interface Dict<Key extends string, Value> extends Record<Key, Value> {}

export const scores: Dict<string, number> = { alice: 1 }
