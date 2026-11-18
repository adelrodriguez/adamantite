import { vi } from 'vitest'

declare const store: { load(): number }

vi.spyOn(store, 'load').mockReturnValue(1)
