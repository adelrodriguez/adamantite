declare const operation: () => number
export const value = Reflect.apply(operation, undefined, [])
