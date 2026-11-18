import { vi } from 'vitest'

const store = { load: (): number => 1 }
const load = vi.spyOn(store, 'load')

vi.when(load).calledWith().thenReturn(2)
