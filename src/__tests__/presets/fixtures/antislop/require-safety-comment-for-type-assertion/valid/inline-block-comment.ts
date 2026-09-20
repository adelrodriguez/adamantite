declare const value: string
type UserId = string & { readonly brand: 'UserId' }
export const id = /* SAFETY: Validation established the invariant. */ value as UserId
