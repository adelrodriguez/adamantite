type Headers = Readonly<Record<string, string>>

type FetchTransportOptions = {
  readonly headers: Headers | (() => Promise<Headers>)
  readonly url: string
}

export function hasHeaderFactory(options?: FetchTransportOptions): boolean {
  return typeof options!.headers === 'function'
}
