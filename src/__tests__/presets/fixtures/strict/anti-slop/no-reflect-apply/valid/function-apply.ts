declare const operation: (...args: number[]) => number
export const value = operation.apply(undefined, [1])
