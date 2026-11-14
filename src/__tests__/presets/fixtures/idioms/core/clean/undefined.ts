declare function consume(value: undefined): void
declare function consumeCallback(callback: () => undefined): void

declare const flags: boolean[]

consume(undefined)

consumeCallback(() => undefined)

export const expression = flags.map((flag) => (flag ? 1 : undefined))

export const mapped = flags.map((flag): number | undefined => {
  if (flag) {
    return 1
  }

  return undefined
})
