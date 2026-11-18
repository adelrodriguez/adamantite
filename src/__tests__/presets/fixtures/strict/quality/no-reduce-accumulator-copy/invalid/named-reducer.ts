const items = ["a", "b"]

function append(acc: string[], item: string) {
  return acc.concat([item])
}

export const copied = items.reduce<string[]>(append, [])
