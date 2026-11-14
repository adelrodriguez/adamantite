const source = { id: 'second' }
const widened: unknown = source
export const parsed = widened as { readonly id: string }
