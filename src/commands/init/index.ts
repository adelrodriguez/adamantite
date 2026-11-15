import process from "node:process"
import * as Array from "effect/Array"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import knip from "#lib/integrations/tooling/knip/index.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { managedPlugins } from "#lib/integrations/tooling/oxlint/plugins/managed.ts"
import tsrs from "#lib/integrations/tooling/oxlint/tsrs.ts"
import sherif from "#lib/integrations/tooling/sherif/index.ts"
import { DependencyInstaller } from "#lib/project/dependency-installer.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { checkIsMonorepo } from "#lib/project/monorepo.ts"
import { readPackageJson, checkRunsTool, SCRIPT_ORDER } from "#lib/project/package-json.ts"
import { readProject } from "#lib/project/project.ts"
import {
  INIT_EDITORS,
  LINT_PRESETS,
  type LintPreset,
  type Selection,
} from "#lib/project/selection.ts"
import { recordLockfile } from "#lib/setup/index.ts"
import { InvalidInitOptions, NoPackageManager } from "#lib/shared/errors.ts"
import * as Output from "#terminal/output.ts"
import { printTitle } from "#terminal/title.ts"
import { initCommandOptions, validateInitOptions } from "./options.ts"
import { collectInteractiveInitOptions } from "./prompts.ts"
import {
  addScripts,
  installDependencies,
  installEditorExtensions,
  setupAgentsGuidance,
  setupEditors,
  setupEffectTsgo,
  setupGitHubActions,
  setupSkill,
  setupToolConfig,
  setupTypescript,
} from "./setup.ts"

export default Command.make("init", initCommandOptions).pipe(
  Command.withDescription(
    "Configure Adamantite in the current directory. Use --non-interactive with setup flags and select each optional feature explicitly"
  ),
  Command.withExamples([
    {
      command: "adamantite init --non-interactive --script check",
      description: "Configure linting without prompts",
    },
    {
      command:
        "adamantite init --non-interactive --script check --preset react --editor vscode --typescript typescript --install-extensions --github-actions --agents",
      description:
        "Configure a React project with VS Code, TypeScript, CI, agent guidance, and the Adamantite skill",
    },
    {
      command: "adamantite init --non-interactive --script analyze",
      description: "Configure analysis, including Sherif checks for a monorepo",
    },
  ]),
  Command.withHandler((options) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      yield* printTitle

      yield* Output.intro("💠 adamantite init")

      const dependencyInstaller = yield* DependencyInstaller
      const packageManager = yield* dependencyInstaller.detectPackageManager(cwd)

      if (!packageManager) {
        return yield* new NoPackageManager({})
      }

      if (packageManager.warnings?.length) {
        for (const warning of packageManager.warnings) {
          yield* Output.warning(warning)
        }
      }

      yield* Output.info(`Detected package manager: ${packageManager.name}`)

      const isMonorepo = yield* checkIsMonorepo(cwd)

      if (isMonorepo) {
        yield* Output.info("This project is a monorepo.")
      }

      if (
        !options.nonInteractive
        && Array.some(
          [
            options.scripts.length > 0,
            options.presets.length > 0,
            options.editors.length > 0,
            Option.isSome(options.typescript),
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

      if (
        options.nonInteractive
        && options.scripts.length === 0
        && Option.isNone(options.typescript)
      ) {
        return yield* new InvalidInitOptions({
          reason:
            "Select at least one script with `--script <name>`, or a TypeScript preset with `--typescript <preset>`.",
        })
      }

      const input = options.nonInteractive
        ? options
        : yield* collectInteractiveInitOptions(cwd, isMonorepo, packageManager.name)

      const initOptions = yield* validateInitOptions(input, packageManager.name)

      // GitHub Actions needs a script, so a run without scripts, TypeScript, editors, and agent
      // guidance selects no setup at all.
      if (
        initOptions.scripts.length === 0
        && Option.isNone(initOptions.typescript)
        && Option.isNone(initOptions.editors)
        && !initOptions.agents
      ) {
        yield* Output.outro("💠 No setup selected, so Adamantite made no changes.")

        return
      }

      const selectedScripts = [...initOptions.scripts]
      const { lint } = initOptions

      const presets = Option.match(lint, {
        onNone: (): readonly LintPreset[] => [],
        onSome: (setup) => setup.presets,
      })

      const hasKnip = checkRunsTool(selectedScripts, "knip")
      // `adamantite analyze` runs Sherif in a monorepo.
      const hasSherif = checkRunsTool(selectedScripts, "sherif") && isMonorepo

      const packageJson = yield* readPackageJson(cwd)

      // A project that already depends on Adamantite keeps the version or source that it chose.
      const dependsOnAdamantite = Predicate.isNotUndefined(
        packageJson.devDependencies?.adamantite ?? packageJson.dependencies?.adamantite
      )

      const dependencies = dependsOnAdamantite ? [] : ["adamantite"]

      if (Option.isSome(lint)) {
        dependencies.push(
          `${oxlint.name}@${oxlint.version}`,
          `${tsrs.name}@${tsrs.version}`,
          `${oxfmt.name}@${oxfmt.version}`,
          // A preset with a managed plugin loads that plugin from the target project.
          ...managedPlugins
            .filter((plugin) => presets.includes(plugin.preset))
            .map((plugin) => `${plugin.name}@${plugin.version}`)
        )
      }

      if (hasSherif) {
        dependencies.push(`${sherif.name}@${sherif.version}`)
      }

      if (hasKnip) {
        dependencies.push(`${knip.name}@${knip.version}`)
      }

      yield* installDependencies(cwd, dependencies)

      if (Option.isSome(lint)) {
        yield* setupToolConfig(cwd, oxfmt, oxfmt.create(cwd))
        yield* setupToolConfig(cwd, oxlint, oxlint.create(cwd, presets))
      }

      if (hasKnip) {
        yield* setupToolConfig(cwd, knip, knip.create(cwd))
      }

      const managedScripts = yield* addScripts(cwd, selectedScripts, {
        nonInteractive: options.nonInteractive,
        overwriteScripts: initOptions.overwriteScripts,
      })

      if (initOptions.agents) {
        yield* setupAgentsGuidance(cwd, packageManager.name, managedScripts, isMonorepo)
        yield* setupSkill(cwd)
      }

      if (Option.isSome(initOptions.typescript)) {
        yield* setupTypescript(cwd, isMonorepo, initOptions.typescript.value)
      }

      // After the TypeScript setup, so a `tsconfig.json` that init creates gets the plugin entry.
      if (presets.includes("effect")) {
        yield* setupEffectTsgo(cwd)
      }

      if (Option.isSome(initOptions.editors)) {
        const { installExtensions, names } = initOptions.editors.value

        yield* setupEditors(cwd, names)

        if (installExtensions) {
          yield* installEditorExtensions(names, selectedScripts, presets)
        }
      }

      if (Option.isSome(initOptions.githubActions)) {
        yield* setupGitHubActions(cwd, initOptions.githubActions.value, managedScripts)
      }

      // What init was asked to set up, in the order of each source list.
      const selection = {
        agents: initOptions.agents,
        ci: Option.isSome(initOptions.githubActions) ? "github" : null,
        editors: Option.match(initOptions.editors, {
          onNone: () => [],
          onSome: ({ names }) => INIT_EDITORS.filter((editor) => names.includes(editor)),
        }),
        presets: Option.isSome(lint)
          ? ["core", ...LINT_PRESETS.filter((preset) => presets.includes(preset))]
          : [],
        scripts: SCRIPT_ORDER.filter((script) => selectedScripts.includes(script)),
        typescript: Option.getOrNull(initOptions.typescript),
      } satisfies Selection

      // Last, so `written` records the files that the steps above wrote.
      const lockfile = yield* recordLockfile(yield* readProject(cwd), selection)

      yield* Output.success(
        lockfile === "written"
          ? `\`${LOCKFILE_PATH}\` written. Commit it with the setup.`
          : `\`${LOCKFILE_PATH}\` already records this setup.`
      )

      yield* Output.outro("💠 Setup finished.")
    }).pipe(Effect.catchTag("QuitError", () => Output.cancel("Setup was cancelled.")))
  )
)
