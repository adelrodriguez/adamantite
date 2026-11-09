import { vi } from 'vitest'
declare const store: { save(): void }
vi.spyOn(store, 'save')
