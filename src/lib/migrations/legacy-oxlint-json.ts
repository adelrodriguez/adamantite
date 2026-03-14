import * as Effect from "effect/Effect"
import { oxlint } from "#lib/integrations/tooling/oxlint.ts"
import { defineMigration } from "#lib/migrations/base.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { MigrationValidationFailed } from "#lib/shared/errors.ts"

const DUAL_OXLINT_CONFIG_WARNING =
  "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`."
const LEGACY_OXLINT_JSON_SUMMARY =
  "Migrating legacy `.oxlintrc.json` configuration to `oxlint.config.ts`."

export const legacyOxlintJson = defineMigration({
  id: "legacy-oxlint-json",

  files: ["oxlint.config.ts", ".oxlintrc.json"],
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

      spinner.start("Migrating `.oxlintrc.json` to `oxlint.config.ts`...")
      yield* oxlint.update(context.cwd)
      spinner.stop("Oxlint config migrated to `oxlint.config.ts` successfully.")
    }),
  validate: (context) =>
    Effect.gen(function* () {
      const oxlintState = yield* oxlint.exists(context.cwd)

      if (oxlintState.format !== "ts") {
        return yield* new MigrationValidationFailed({
          migrationId: "legacy-oxlint-json",
          reason: "`oxlint.config.ts` is not the active oxlint config.",
        })
      }
    }),
})
