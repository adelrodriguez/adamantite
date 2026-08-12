import type { Migration } from "#lib/migrations/base.ts"
import migrationLegacyKnipJson from "#lib/migrations/legacy-knip-json.ts"
import migrationLegacyOxfmtJson from "#lib/migrations/legacy-oxfmt-json.ts"
import migrationLegacyOxlintJson from "#lib/migrations/legacy-oxlint-json.ts"
import migrationLegacyTypecheckScript from "#lib/migrations/legacy-typecheck-script.ts"

export const migrations: readonly Migration[] = [
  migrationLegacyOxfmtJson,
  migrationLegacyKnipJson,
  migrationLegacyOxlintJson,
  migrationLegacyTypecheckScript,
]

export const migrationsById: Readonly<Record<string, Migration>> = Object.fromEntries(
  migrations.map((migration) => [migration.id, migration])
)
