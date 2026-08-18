import type { Migration } from "#lib/migrations/base.ts"
import migrationHardcodedNodeVersion from "#lib/migrations/hardcoded-node-version.ts"
import migrationLegacyKnipJson from "#lib/migrations/legacy-knip-json.ts"
import migrationLegacyOxfmtJson from "#lib/migrations/legacy-oxfmt-json.ts"
import migrationLegacyOxlintJson from "#lib/migrations/legacy-oxlint-json.ts"
import migrationLegacyTypecheckScript from "#lib/migrations/legacy-typecheck-script.ts"
import migrationRemovedReactCompilerRule from "#lib/migrations/removed-react-compiler-rule.ts"

// The removed-rule migration runs after the legacy oxlint migration so configs converted from
// `.oxlintrc.json` in the same run are also scrubbed.
export const migrations: readonly Migration[] = [
  migrationLegacyOxfmtJson,
  migrationLegacyKnipJson,
  migrationLegacyOxlintJson,
  migrationRemovedReactCompilerRule,
  migrationLegacyTypecheckScript,
  migrationHardcodedNodeVersion,
]

export const migrationsById: Readonly<Record<string, Migration>> = Object.fromEntries(
  migrations.map((migration) => [migration.id, migration])
)
