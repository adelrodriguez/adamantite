declare const owner: { readonly base: number }

declare const operation: (this: { readonly base: number }, ...args: number[]) => number

export const value = operation.apply(owner, [1])
