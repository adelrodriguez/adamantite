const items = [1, 2, 3]

export const lastThree = items.reduce<number[]>((acc, item) => acc.slice(-2).concat(item), [])
