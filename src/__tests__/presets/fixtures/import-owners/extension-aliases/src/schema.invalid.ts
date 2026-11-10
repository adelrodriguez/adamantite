// The alias adds `.ts`, so `#lib/db/schema.d` names this declaration file, and a relative path
// reaches it.
import type { Schema } from "./lib/db/schema.d.ts"

export const schemas: Schema[] = []
