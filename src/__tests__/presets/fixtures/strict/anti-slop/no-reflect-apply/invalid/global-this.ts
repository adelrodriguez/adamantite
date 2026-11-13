declare const operation: () => number
export const value = globalThis.Reflect.apply(operation, undefined, [])
