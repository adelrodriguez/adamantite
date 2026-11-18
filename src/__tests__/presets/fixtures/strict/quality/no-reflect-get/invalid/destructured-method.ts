declare const owner: { property: string }
const { get } = Reflect
export const value = get(owner, 'property')
