declare const value: string
type UserId = string & { readonly brand: 'UserId' }
export const id = value as UserId // SAFETY: Too late.
