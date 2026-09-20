declare const value: string
type UserId = string & { readonly brand: 'UserId' }
export const id = /* SAFETY: */ value as UserId
