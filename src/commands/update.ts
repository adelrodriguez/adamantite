import process from "node:process"
import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import * as Command from "effect/unstable/cli/Command"
import type { ToolingPackage } from "#lib/integrations/base.ts"
import { assessProject } from "#lib/integrations/assessment.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { normalizeDependencyVersion, readPackageJson } from "#lib/workspace/package-json.ts"
import { printFindings } from "#terminal/findings.ts"
import { Prompter } from "#terminal/prompter.ts"
import { printTitle } from "#terminal/title.ts"

const knownPackages = [
  oxlint,
  tsgolint,
  oxfmt,
  sherif,
  knip,
] as const satisfies readonly ToolingPackage[]

interface PackageUpdate {
  readonly currentVersion: string
  readonly name: string
  readonly targetVersion: string
}

function getFallbackPackageUpdates(
  packageJson: PackageJson,
  coveredPackages: ReadonlySet<string>
): PackageUpdate[] {
  return Array.filterMap(knownPackages, (pkg) => {
    if (coveredPackages.has(pkg.name)) {
      return Result.failVoid
    }

    const dependency =
      packageJson.devDependencies?.[pkg.name] ?? packageJson.dependencies?.[pkg.name]

    return dependency && normalizeDependencyVersion(dependency) !== pkg.version
      ? Result.succeed({
          currentVersion: dependency,
          name: pkg.name,
          targetVersion: pkg.version,
        })
      : Result.failVoid
  })
}

export default Command.make("update").pipe(
  Command.withDescription("Update Adamantite-managed dependencies and report setup findings"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter
      const dependencyInstaller = yield* DependencyInstaller

      yield* printTitle()
      yield* prompter.intro("💠 adamantite update")

      const packageJson = yield* readPackageJson(cwd)
      const assessment = yield* assessProject(cwd, packageJson)
      const packageActions = assessment.packageActions
      const coveredPackages = new Set(packageActions.map((action) => action.package))
      const updates: PackageUpdate[] = [
        ...packageActions.map((action) => ({
          currentVersion:
            action.type === "install_package" ? "not installed" : action.currentVersion,
          name: action.package,
          targetVersion: action.targetVersion,
        })),
        ...getFallbackPackageUpdates(packageJson, coveredPackages),
      ]

      if (updates.length > 0) {
        yield* prompter.log.info("The following dependencies will be updated:")

        for (const dependency of updates) {
          yield* prompter.log.info(
            `  ${dependency.name}: ${dependency.currentVersion} → ${dependency.targetVersion}`
          )
        }

        yield* prompter.withSpinner(
          () =>
            dependencyInstaller.addDevDependencies(
              updates.map((dependency) => `${dependency.name}@${dependency.targetVersion}`),
              cwd,
              { silent: true }
            ),
          {
            failure: "Failed to update dependencies",
            start: "Updating dependencies...",
            success: "Dependencies updated successfully",
          }
        )
        yield* prompter.log.success("Dependencies updated successfully.")
      }

      const finalAssessment = updates.length === 0 ? assessment : yield* assessProject(cwd)

      for (const warning of finalAssessment.warnings) {
        yield* prompter.log.warning(warning)
      }

      const findings = finalAssessment.findings

      if (findings.length > 0) {
        yield* printFindings(findings)
        yield* prompter.log.info(
          "Run `adamantite doctor` to get the combined Markdown repair prompt."
        )
      }

      if (updates.length === 0 && findings.length === 0) {
        yield* prompter.log.success("No changes needed.")
        return "no-changes" as const
      }

      return "success" as const
    }).pipe(
      Effect.tapError(() =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          yield* prompter.outro("❌ Update failed")
        })
      ),
      Effect.tap((value) =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          yield* prompter.outro(
            value === "no-changes"
              ? "✅ Adamantite is already up to date."
              : "✅ Update completed successfully!"
          )
        })
      )
    )
  )
)
