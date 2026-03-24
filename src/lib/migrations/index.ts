import type { Migration } from "#lib/migrations/base.ts"
import { legacyKnipJson } from "#lib/migrations/legacy-knip-json.ts"
import { legacyOxfmtJson } from "#lib/migrations/legacy-oxfmt-json.ts"
import { legacyOxlintJson } from "#lib/migrations/legacy-oxlint-json.ts"
import { legacyTypecheckScript } from "#lib/migrations/legacy-typecheck-script.ts"
import { oxlintTypecheck } from "#lib/migrations/oxlint-typecheck.ts"

export const migrations: readonly Migration[] = [
  legacyOxfmtJson,
  legacyKnipJson,
  legacyOxlintJson,
  oxlintTypecheck,
  legacyTypecheckScript,
]
