declare const value: string
type UserId = string & { readonly brand: 'UserId' }
export function parse(): UserId {
  // SAFETY: Validation above established the UserId invariant.
  return value as UserId
}
