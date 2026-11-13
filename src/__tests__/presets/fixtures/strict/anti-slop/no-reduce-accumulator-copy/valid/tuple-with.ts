const items = [3, 1, 2]

export const range = items.reduce(
  (acc, item) => acc.with(0, Math.min(acc[0], item)).with(1, Math.max(acc[1], item)),
  [Infinity, -Infinity]
)
