declare const owner: { property: string }

export const changed = Reflect.set(owner, "property", "next")
