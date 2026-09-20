declare const value: string
type UserId = string & { readonly brand: 'UserId' }
// This cast seems fine.
export const id = value as UserId
