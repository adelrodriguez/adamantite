declare const value: string
type UserId = string & { readonly brand: 'UserId' }
// SAFETY:
export const id = value as UserId
