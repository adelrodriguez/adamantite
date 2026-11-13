const items = [3, 1, 2]

export const range = items.reduce<number[]>(
  (acc, item) =>
    acc.with(0, Math.min(acc[0] ?? item, item)).with(1, Math.max(acc[1] ?? item, item)),
  [Infinity, -Infinity]
)
