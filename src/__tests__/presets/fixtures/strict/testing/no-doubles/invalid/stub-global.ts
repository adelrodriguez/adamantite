import { vi } from 'vitest'

declare const fakeFetch: typeof fetch

vi.stubGlobal('fetch', fakeFetch)
