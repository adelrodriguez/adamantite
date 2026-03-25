import * as Effect from "effect/Effect"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import { defineMigration } from "#lib/migrations/base.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { MigrationValidationFailed } from "#lib/shared/errors.ts"

function getLegacyConfigPath() {
  return oxlint.files[1].path
}

const DUAL_OXLINT_CONFIG_WARNING = `Found both \`${oxlint.config}\` and \`${getLegacyConfigPath()}\`. Adamantite will use \`${oxlint.config}\`.`
const LEGACY_OXLINT_JSON_SUMMARY = `Migrating legacy \`${getLegacyConfigPath()}\` configuration to \`${oxlint.config}\`.`

export const legacyOxlintJson = defineMigration({
  id: "legacy-oxlint-json",

  files: [oxlint.config, getLegacyConfigPath()],
  tags: ["update"],
  title: "Legacy oxlint JSON config",

  check: (context) =>
    Effect.gen(function* () {
      const oxlintState = yield* oxlint.exists(context.cwd)
      const warnings = oxlintState.hasBoth ? [DUAL_OXLINT_CONFIG_WARNING] : []

      if (oxlintState.format === "json") {
        return {
          status: "needs_migration",
          summary: LEGACY_OXLINT_JSON_SUMMARY,
          warnings,
        }
      }

      if (oxlintState.format === "ts") {
        return { status: "valid", warnings }
      }

      return { status: "not_applicable", warnings }
    }),
  migrate: (context) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const spinner = prompter.spinner()

      spinner.start(`Migrating \`${getLegacyConfigPath()}\` to \`${oxlint.config}\`...`)
      yield* oxlint.update(context.cwd)
      spinner.stop(`Oxlint config migrated to \`${oxlint.config}\` successfully.`)
    }),
  validate: (context) =>
    Effect.gen(function* () {
      const oxlintState = yield* oxlint.exists(context.cwd)

      if (oxlintState.format !== "ts") {
        return yield* new MigrationValidationFailed({
          migrationId: "legacy-oxlint-json",
          reason: `\`${oxlint.config}\` is not the active oxlint config.`,
        })
      }
    }),
})
