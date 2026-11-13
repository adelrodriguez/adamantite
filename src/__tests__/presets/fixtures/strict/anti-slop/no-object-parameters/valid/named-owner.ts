interface Owner {
  readonly id: string
}

export function consume(value: Owner): string {
  return value.id
}
