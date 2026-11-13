declare const name: string | undefined

export const result = { id: 1, ...(name === undefined ? undefined : { name }) }
