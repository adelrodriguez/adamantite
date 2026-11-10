import { query } from "#lib/db/query.ts"
import { store } from "./lib/cache/store.ts"

export const rows = query()
export const cache = store
