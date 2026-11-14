type Headers = Readonly<Record<string, string>>

type FetchTransportOptions = {
  readonly headers: Headers | (() => Promise<Headers>)
  readonly url: string
}

export async function resolveHeaders(options: FetchTransportOptions): Promise<Headers> {
  const { headers } = options

  return typeof headers === 'function' ? await headers() : headers
}
