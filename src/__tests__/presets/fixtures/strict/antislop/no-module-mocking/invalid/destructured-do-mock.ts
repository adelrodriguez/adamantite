import { vi } from 'vitest'
const { doMock } = vi
doMock('./user-store', () => ({}))
