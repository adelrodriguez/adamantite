const items = ["a", "b"]

export const copied = items.reduce<string[]>((acc, item) => {
  acc.push(item)

  return acc
}, [])
