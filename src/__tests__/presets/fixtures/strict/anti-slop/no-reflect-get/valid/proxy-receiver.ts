declare const target: { property: string }
export const proxy = new Proxy(target, {
  get(owner, key, receiver) {
    return Reflect.get(owner, key, receiver)
  },
})
