const items = [{ id: "a", n: 1 }]

export const totals = items.reduce(
  (acc, item) => {
    Object.assign(acc, { [item.id]: item.n })

    return Object.assign({}, acc, { sum: acc.sum + item.n })
  },
  { sum: 0 }
)
