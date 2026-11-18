const items = [{ id: "a" }]

export const byId = items.reduce((acc, item) => Object.assign({}, acc, { [item.id]: item }), {})
