import type { Migration } from "#lib/migrations/base.ts"
import { legacyOxlintJson } from "#lib/migrations/legacy-oxlint-json.ts"
import { legacyTypecheckScript } from "#lib/migrations/legacy-typecheck-script.ts"
import { oxlintTypecheck } from "#lib/migrations/oxlint-typecheck.ts"

export const migrations: readonly Migration[] = [
  legacyOxlintJson,
  oxlintTypecheck,
  legacyTypecheckScript,
]
