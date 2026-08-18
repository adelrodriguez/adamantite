import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import { defineMigration } from "#lib/migrations/base.ts"
import { MigrationValidationFailed } from "#lib/shared/errors.ts"
import { readFileIfExists, writeFile } from "#lib/shared/filesystem.ts"
import { removeOxlintRules } from "#lib/workspace/tooling/oxlint.ts"

/**
 * Oxlint 1.79.0 removed the nursery `react/react-compiler` rule in favor of per-category React
 * Compiler rules, and fails to load any config that still references the old name.
 */
const REMOVED_RULES = ["react/react-compiler"]

const MANUAL_WARNING_SUFFIX =
  "Remove the `react/react-compiler` rule manually; oxlint fails to load configs that reference it."

const readConfig = (cwd: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path

    return yield* readFileIfExists(path.join(cwd, oxlint.config))
  })

export default defineMigration({
  check: (context) =>
    Effect.gen(function* () {
      const content = yield* readConfig(context.cwd)

      if (Option.isNone(content)) {
        return { status: "not-applicable", warnings: [] } as const
      }

      const removal = removeOxlintRules(content.value, REMOVED_RULES)

      if (removal.kind === "absent") {
        return { status: "not-applicable", warnings: [] } as const
      }

      if (removal.kind === "manual") {
        return {
          status: "not-applicable",
          warnings: [`${removal.reason} ${MANUAL_WARNING_SUFFIX}`],
        } as const
      }

      return {
        status: "needed",
        summary:
          "Removing the `react/react-compiler` rule from `oxlint.config.ts`; oxlint replaced it with per-category React Compiler rules that the react preset now enables.",
        warnings: [],
      } as const
    }),
  files: [oxlint.config],
  id: "removed-react-compiler-rule",
  migrate: (context) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const content = yield* readConfig(context.cwd)

      if (Option.isNone(content)) {
        return yield* Effect.die(new Error("check() guaranteed the oxlint config exists"))
      }

      const removal = removeOxlintRules(content.value, REMOVED_RULES)

      if (removal.kind !== "patchable") {
        return yield* Effect.die(new Error("check() guaranteed the oxlint config is patchable"))
      }

      yield* writeFile(path.join(context.cwd, oxlint.config), removal.updatedContent)

      return { warnings: [] }
    }),
  tags: ["update"],
  title: "Removed react/react-compiler rule",
  validate: (context) =>
    Effect.gen(function* () {
      const content = yield* readConfig(context.cwd)

      if (
        Option.exists(content, (value) => removeOxlintRules(value, REMOVED_RULES).kind !== "absent")
      ) {
        return yield* new MigrationValidationFailed({
          migrationId: "removed-react-compiler-rule",
          reason: "`oxlint.config.ts` still references the removed `react/react-compiler` rule.",
        })
      }
    }),
})
