export const mask = 0xffn
export const flag = 0xff
export const timeout = 10_000

export function token(name: string) {
  return `prefix:${name}`
}

export function hasProtocol(input: string) {
  return /^https?:/i.test(input)
}
