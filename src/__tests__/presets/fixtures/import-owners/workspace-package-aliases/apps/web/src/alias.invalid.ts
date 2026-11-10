// The package declares the alias, so the option does not resolve from the workspace root. The
// import still names the module as the option states it.
import { query } from "#lib/db/query.ts"

export const rows = query()
