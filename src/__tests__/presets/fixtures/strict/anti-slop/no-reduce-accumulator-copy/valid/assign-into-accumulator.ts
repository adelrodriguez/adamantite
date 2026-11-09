const items = [{ id: "a" }]

export const merged = items.reduce((acc, item) => Object.assign(acc, item), {})
