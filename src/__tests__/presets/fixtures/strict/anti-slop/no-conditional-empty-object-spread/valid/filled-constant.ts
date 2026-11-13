declare const name: string | undefined

const fallback: { id?: number } = {}
fallback.id = 1

export const result = { ...(name === undefined ? fallback : { name }) }
