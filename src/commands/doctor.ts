import process from "node:process"
import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import type { AssessmentAction } from "#lib/integrations/base.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { runMigration } from "#lib/migrations/base.ts"
import { migrationsById } from "#lib/migrations/index.ts"
import { DependencyInstaller } from "#lib/services/dependency-installer.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { collectApplicableAssessments } from "#lib/shared/assessment.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { printTitle } from "#lib/shared/terminal.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const fix = Flag.boolean("fix").pipe(
  Flag.withDescription("Automatically fix safe package install/update issues")
)

const integrations = [knip, oxfmt, oxlint, sherif, tsgolint] as const

const createFixersByIntegration = {
  [knip.name]: knip,
  [oxfmt.name]: oxfmt,
  [oxlint.name]: oxlint,
} as const

const updateFixersByIntegration = {
  [oxlint.name]: oxlint,
} as const

function checkHasIntegrationFixer<const T extends Record<string, unknown>>(
  fixers: T,
  integrationName: string
): integrationName is Extract<keyof T, string> {
  return Object.hasOwn(fixers, integrationName)
}

function getActionKey(integrationName: string, action: AssessmentAction) {
  switch (action.type) {
    case "install_package":
      return `${integrationName}:${action.type}:${action.package}:${action.targetVersion}`
    case "update_package":
      return `${integrationName}:${action.type}:${action.package}:${action.targetVersion}`
    case "create_config":
    case "update_config":
      return `${integrationName}:${action.type}:${action.path}`
    case "manual_fix":
      return `${integrationName}:${action.type}:${action.path ?? action.description}`
    case "run_migration":
      return `${integrationName}:${action.type}:${action.migrationId}`
  }
}

export default Command.make("doctor", { fix }).pipe(
  Command.withDescription("Check Adamantite-managed integrations in the current project"),
  Command.withHandler(({ fix }) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter

      yield* printTitle()
      yield* prompter.intro("💠 adamantite doctor")

      const packageJson = yield* readPackageJson(cwd)

      if (!packageJson.devDependencies?.adamantite && !packageJson.dependencies?.adamantite) {
        yield* prompter.log.warning(
          "`adamantite` is not installed in this project. Install it before running `adamantite doctor`."
        )
        yield* prompter.outro("⚠️ Doctor found issues.")
        yield* new CommandFailed({
          command: "doctor",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }

      // 1. Assess integrations.
      const assessments = yield* collectApplicableAssessments(integrations, cwd)

      // 2. Print warnings.
      for (const { assessment } of assessments) {
        for (const warning of assessment.warnings) {
          yield* prompter.log.warning(warning)
        }
      }

      if (assessments.length === 0) {
        yield* prompter.log.success("No applicable integrations found.")
        yield* prompter.outro("✅ Doctor completed successfully!")
        return
      }

      const actions = assessments.flatMap(({ assessment, integration }) =>
        assessment.actions.map((action) => ({ action, integration }))
      )

      if (actions.length === 0) {
        yield* prompter.log.success("No issues found.")
        yield* prompter.outro("✅ Doctor completed successfully!")
        return
      }

      // 3. Optionally apply fixes in order: packages -> configs -> migrations.
      const appliedActions = new Set<string>()

      if (fix) {
        yield* Effect.gen(function* () {
          const packageActions = actions.filter(
            ({ action }) => action.type === "install_package" || action.type === "update_package"
          )

          if (packageActions.length > 0) {
            const dependencyInstaller = yield* DependencyInstaller
            const packages: string[] = []

            for (const { action } of packageActions) {
              if (action.type === "install_package" || action.type === "update_package") {
                packages.push(`${action.package}@${action.targetVersion}`)
              }
            }

            yield* dependencyInstaller.addDevDependencies(packages, cwd, { silent: true })

            for (const { action, integration } of packageActions) {
              if (action.type === "install_package") {
                yield* prompter.log.success(
                  `Fixed: installed \`${action.package}@${action.targetVersion}\`.`
                )
              }

              if (action.type === "update_package") {
                yield* prompter.log.success(
                  `Fixed: updated \`${action.package}\` from \`${action.currentVersion}\` to \`${action.targetVersion}\`.`
                )
              }

              appliedActions.add(getActionKey(integration.name, action))
            }
          }

          for (const { action, integration } of actions) {
            if (action.type !== "create_config") {
              continue
            }

            if (!checkHasIntegrationFixer(createFixersByIntegration, integration.name)) {
              continue
            }

            const fixer = createFixersByIntegration[integration.name]
            yield* fixer.create(cwd)
            yield* prompter.log.success(`Fixed: created \`${action.path}\`.`)
            appliedActions.add(getActionKey(integration.name, action))
          }

          for (const { action, integration } of actions) {
            if (action.type !== "update_config") {
              continue
            }

            if (!checkHasIntegrationFixer(updateFixersByIntegration, integration.name)) {
              continue
            }

            const fixer = updateFixersByIntegration[integration.name]
            yield* fixer.update(cwd)

            yield* prompter.log.success(`Fixed: updated \`${action.path}\`.`)
            appliedActions.add(getActionKey(integration.name, action))
          }

          for (const { action, integration } of actions) {
            if (action.type !== "run_migration") {
              continue
            }

            const migration = migrationsById[action.migrationId]
            if (!migration) {
              continue
            }

            yield* runMigration(migration, { cwd })
            appliedActions.add(getActionKey(integration.name, action))
          }
        }).pipe(
          Effect.tapError(() =>
            Effect.gen(function* () {
              yield* prompter.outro("❌ Doctor failed")
            })
          )
        )
      }

      // 4. Report remaining issues or success.
      const remainingActions = actions.filter(
        ({ action, integration }) => !appliedActions.has(getActionKey(integration.name, action))
      )

      if (fix && remainingActions.length === 0) {
        yield* prompter.outro("✅ Doctor completed successfully!")
        return
      }

      for (const { action } of fix ? remainingActions : actions) {
        yield* prompter.log.warning(`Needs attention: ${action.description}`)
      }

      yield* prompter.outro("⚠️ Doctor found issues.")
      yield* new CommandFailed({
        command: "doctor",
        exitCode: ChildProcessSpawner.ExitCode(1),
      })
    })
  )
)
