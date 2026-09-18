import process from "node:process"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import * as Command from "effect/unstable/cli/Command"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { InvalidInitOptions, NoPackageManager } from "#lib/shared/errors.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"
import { checkIsSupportedPackageManager } from "#lib/workspace/package-json.ts"
import { Prompter } from "#terminal/prompter.ts"
import { printTitle } from "#terminal/title.ts"
import { initCommandOptions, validateInitOptions } from "./options.ts"
import { collectInteractiveInitOptions } from "./prompts.ts"
import {
  addScripts,
  installDependencies,
  installEditorExtensions,
  setupAgentsGuidance,
  setupEditors,
  setupGitHubActions,
  setupToolConfig,
  setupTypescript,
} from "./setup.ts"

export default Command.make("init", initCommandOptions).pipe(
  Command.withDescription(
    "Initialize Adamantite in the current directory. Setup flags require --non-interactive; omitted boolean setup flags are disabled"
  ),
  Command.withExamples([
    {
      command: "adamantite init --non-interactive --script check",
      description: "Configure linting without prompts",
    },
    {
      command:
        "adamantite init --non-interactive --script check --preset react --editor vscode --typescript --install-extensions --github-actions --agents",
      description: "Configure a React project with VS Code, TypeScript, CI, and agent guidance",
    },
    {
      command: "adamantite init --non-interactive --script analyze",
      description: "Configure analysis; in a detected monorepo it includes Sherif",
    },
  ]),
  Command.withHandler((options) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter

      yield* printTitle()

      yield* prompter.intro("💠 adamantite init")

      const dependencyInstaller = yield* DependencyInstaller
      const packageManager = yield* dependencyInstaller.detectPackageManager(cwd)

      if (!packageManager) {
        return yield* new NoPackageManager({})
      }

      if (packageManager.warnings?.length) {
        for (const warning of packageManager.warnings) {
          yield* prompter.log.warning(warning)
        }
      }

      yield* prompter.log.info(`Detected package manager: ${packageManager.name}`)

      const isMonorepo = yield* checkIsMonorepo(cwd)

      if (isMonorepo) {
        yield* prompter.log.info("We've detected a monorepo setup in your project.")
      }

      if (
        !options.nonInteractive
        && Array.some(
          [
            options.scripts.length > 0,
            options.presets.length > 0,
            options.editors.length > 0,
            options.typescript,
            options.installExtensions,
            options.githubActions,
            options.agents,
            options.overwriteScripts,
          ],
          Predicate.isTruthy
        )
      ) {
        return yield* new InvalidInitOptions({
          reason: "Setup flags require `--non-interactive`.",
        })
      }

      const input = options.nonInteractive
        ? options
        : yield* collectInteractiveInitOptions(cwd, isMonorepo)
      const initOptions = yield* validateInitOptions(input, {
        nonInteractive: options.nonInteractive,
        packageManager: packageManager.name,
      })
      const selectedScripts = initOptions.scripts
      const presets = initOptions.presets
      const selectedEditors = initOptions.editors
      const shouldSetupTypescript = initOptions.typescript
      const installExtensions = initOptions.installExtensions
      const enableGitHubActions = initOptions.githubActions
      const shouldAddAgentsGuidance = initOptions.agents

      const hasOxlint = selectedScripts.includes("check") || selectedScripts.includes("fix")
      const hasKnip = selectedScripts.includes("analyze")
      // `adamantite analyze` runs Sherif in a monorepo.
      const hasSherif = hasKnip && isMonorepo

      const dependencies = ["adamantite"]

      if (hasOxlint) {
        dependencies.push(
          `${oxlint.name}@${oxlint.version}`,
          `${tsgolint.name}@${tsgolint.version}`,
          `${oxfmt.name}@${oxfmt.version}`
        )
      }

      if (hasSherif) {
        dependencies.push(`${sherif.name}@${sherif.version}`)
      }

      if (hasKnip) {
        dependencies.push(`${knip.name}@${knip.version}`)
      }

      yield* installDependencies(cwd, dependencies)

      if (hasOxlint) {
        yield* setupToolConfig(cwd, oxfmt, oxfmt.create(cwd))
        yield* setupToolConfig(cwd, oxlint, oxlint.create(cwd, presets))
      }

      if (hasKnip) {
        yield* setupToolConfig(cwd, knip, knip.create(cwd))
      }

      const writtenScripts = yield* addScripts(cwd, selectedScripts, {
        nonInteractive: options.nonInteractive,
        overwriteScripts: initOptions.overwriteScripts,
      })

      if (shouldAddAgentsGuidance) {
        yield* setupAgentsGuidance(cwd, packageManager.name, writtenScripts, isMonorepo)
      }

      if (shouldSetupTypescript) {
        yield* setupTypescript(cwd, isMonorepo)
      }

      yield* setupEditors(cwd, selectedEditors)

      if (installExtensions) {
        yield* installEditorExtensions(selectedEditors, selectedScripts)
      }

      if (enableGitHubActions) {
        const packageManagerName = packageManager.name

        if (checkIsSupportedPackageManager(packageManagerName)) {
          yield* setupGitHubActions(cwd, packageManagerName, selectedScripts)
        } else {
          yield* prompter.log.warning(
            `Skipping GitHub Actions setup: \`${packageManagerName}\` is not a supported package manager for CI workflow generation.`
          )
        }
      }

      yield* prompter.log.success("Your project is now configured")

      yield* prompter.outro("💠 Adamantite initialized successfully!")
    }).pipe(
      Effect.catchTags({
        OperationCancelled: () =>
          Effect.gen(function* () {
            const prompter = yield* Prompter
            yield* prompter.cancel("You've cancelled the initialization process.")
          }),
      })
    )
  )
)
