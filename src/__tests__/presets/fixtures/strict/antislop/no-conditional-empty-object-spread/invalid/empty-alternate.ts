declare const value: string | undefined
export const result = { ...(value !== undefined ? { value } : {}) }
