declare const value: string
type UserId = string & { readonly brand: 'UserId' }
// SAFETY: The parser established the UserId invariant.
export const id = value as UserId
