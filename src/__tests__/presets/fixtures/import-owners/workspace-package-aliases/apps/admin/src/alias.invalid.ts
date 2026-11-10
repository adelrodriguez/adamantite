// A `#` option names the alias in every package, as a package name does. This package has its own
// `#lib/db`, and the option restricts it too.
import { query } from "#lib/db/query.ts"

export const rows = query()
