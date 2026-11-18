declare const value: string
type UserId = string & { readonly brand: 'UserId' }
export const first = 1 // SAFETY: first is a literal.
export const id = value as UserId
