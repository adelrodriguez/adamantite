declare const name: string | undefined

const EMPTY = {}

export const result = { id: 1, ...(name === undefined ? EMPTY : { name }) }
