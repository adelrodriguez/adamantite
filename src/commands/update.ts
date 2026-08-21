import process from "node:process"
import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import * as Command from "effect/unstable/cli/Command"
import type { ToolingPackage } from "#lib/integrations/base.ts"
import github from "#lib/integrations/ci/github.ts"
import zed from "#lib/integrations/editors/zed.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { collectApplicableAssessments } from "#lib/shared/assessment.ts"
import { collectFindings, renderFindingsPrompt } from "#lib/shared/findings.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { type AgentHarness, AgentRunner } from "#lib/workspace/agent-runner.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { GitStatus } from "#lib/workspace/git-status.ts"
import { normalizeDependencyVersion, readPackageJson } from "#lib/workspace/package-json.ts"
import tsconfig from "#lib/workspace/tsconfig.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { printFindings } from "#terminal/findings.ts"
import { Prompter } from "#terminal/prompter.ts"
import { printTitle } from "#terminal/title.ts"

const integrations = [oxlint, tsgolint, oxfmt, sherif, knip, tsconfig, github, zed] as const
const version = getPackageVersion()
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
      const assessments = yield* collectApplicableAssessments(integrations, cwd, packageJson)
      const packageActions = assessments.flatMap(({ assessment }) => assessment.packageActions)
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

      const finalAssessments =
        updates.length === 0
          ? assessments
          : yield* readPackageJson(cwd).pipe(
              Effect.flatMap((updatedPackageJson) =>
                collectApplicableAssessments(integrations, cwd, updatedPackageJson)
              )
            )

      for (const { assessment } of finalAssessments) {
        for (const warning of assessment.warnings) {
          yield* prompter.log.warning(warning)
        }
      }

      const findings = collectFindings(finalAssessments)

      if (findings.length > 0) {
        yield* printFindings(findings)
        const terminal = yield* TerminalCapabilities

        if (yield* terminal.isInteractive) {
          const agentRunner = yield* AgentRunner
          const availableHarnesses = yield* agentRunner.detect()
          const prompt = renderFindingsPrompt(findings, version)
          const choice = yield* prompter.select<AgentHarness | "prompt">({
            message: "How would you like to handle these findings?",
            options: [
              ...availableHarnesses.map((harness) => ({
                label: harness === "claude" ? "Fix with Claude Code" : "Fix with Codex",
                value: harness,
              })),
              { label: "Get the prompt", value: "prompt" },
            ],
          })

          if (choice === "prompt") {
            yield* prompter.log.info(prompt)
            yield* terminal.copyToClipboard(prompt)
            yield* prompter.log.success(
              "The prompt was printed and sent to the terminal clipboard."
            )
          } else {
            const gitStatus = yield* GitStatus
            let shouldRunAgent = true

            if (yield* gitStatus.isDirty(cwd)) {
              yield* prompter.log.warning(
                "Adamantite could not confirm a clean working tree. The agent can overwrite or mix with existing changes."
              )
              shouldRunAgent = yield* prompter.confirm({
                initialValue: false,
                message: "Run the agent anyway?",
              })
            }

            if (shouldRunAgent) {
              const command = agentRunner.getCommand(choice, prompt)
              yield* prompter.log.info(
                `Running: ${[command.command, ...command.args]
                  .map((part) => JSON.stringify(part))
                  .join(" ")}`
              )

              const exitCode = yield* prompter.withSpinner(
                () => agentRunner.run(choice, prompt, cwd),
                {
                  failure: `${choice} failed to start.`,
                  start: `Running ${choice}...`,
                  success: (code) => `${choice} exited with code ${code}.`,
                }
              )

              if (exitCode !== 0) {
                yield* prompter.log.warning(`${choice} did not complete the requested repair.`)
              }

              const reassessedFindings = yield* readPackageJson(cwd).pipe(
                Effect.flatMap((manifest) =>
                  collectApplicableAssessments(integrations, cwd, manifest)
                ),
                Effect.map((currentAssessments) => collectFindings(currentAssessments))
              )

              if (reassessedFindings.length === 0) {
                yield* prompter.log.success("The agent resolved every finding.")
              } else {
                yield* prompter.log.warning("Findings remain after the agent run.")
                yield* printFindings(reassessedFindings)
              }
            }
          }
        }
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
