const values = [" a ", ""]

export const trimmed = values.map((value) => value.trim())

export const present = values.filter((value) => value.length > 0)
