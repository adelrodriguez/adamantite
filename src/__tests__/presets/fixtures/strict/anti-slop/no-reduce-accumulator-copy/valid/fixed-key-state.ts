const items = [{ n: 1 }, { n: 2 }]

export const total = items.reduce((acc, item) => Object.assign({}, acc, { sum: acc.sum + item.n }), {
  sum: 0,
})
