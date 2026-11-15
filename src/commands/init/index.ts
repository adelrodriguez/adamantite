import process from "node:process"
import * as Array from "effect/Array"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import { applySetup } from "#commands/setup.ts"
import { DependencyInstaller } from "#lib/project/dependency-installer.ts"
import { readLockfile } from "#lib/project/lockfile.ts"
import { checkIsMonorepo } from "#lib/project/monorepo.ts"
import { SCRIPT_ORDER } from "#lib/project/package-json.ts"
import { readProject } from "#lib/project/project.ts"
import {
  addSelection,
  INIT_EDITORS,
  LINT_PRESETS,
  type LintPreset,
  type Selection,
} from "#lib/project/selection.ts"
import { InvalidInitOptions, NoPackageManager } from "#lib/shared/errors.ts"
import * as Mode from "#terminal/mode.ts"
import * as Output from "#terminal/output.ts"
import { printZedExtensions } from "#terminal/setup.ts"
import { printTitle } from "#terminal/title.ts"
import { initCommandOptions, validateInitOptions } from "./options.ts"
import { collectInteractiveInitOptions } from "./prompts.ts"

export default Command.make("init", { ...initCommandOptions, json: Mode.json }).pipe(
  Command.withDescription(
    "Configure Adamantite in the current directory. Use --non-interactive or --json with setup flags and select each optional feature explicitly. Exits 1 when findings remain after setup"
  ),
  Command.withExamples([
    {
      command: "adamantite init --non-interactive --script check",
      description: "Configure linting without prompts",
    },
    {
      command:
        "adamantite init --non-interactive --script check --preset react --editor vscode --typescript typescript --github-actions --agents",
      description:
        "Configure a React project with VS Code, TypeScript, CI, agent guidance, and the Adamantite skill",
    },
    {
      command: "adamantite init --non-interactive --script analyze",
      description: "Configure analysis, including Sherif checks for a monorepo",
    },
  ]),
  Command.withHandler(({ json, ...flags }) => {
    // `--json` never prompts, so it sets up from the flags.
    const options = { ...flags, nonInteractive: flags.nonInteractive || json }

    return Effect.gen(function* () {
      const cwd = process.cwd()
      yield* printTitle

      yield* Output.intro("💠 adamantite init")

      // First, so a lockfile that does not read fails init before it changes a file.
      const recorded = yield* readLockfile(cwd)

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
            options.githubActions,
            options.agents,
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
        : yield* collectInteractiveInitOptions(isMonorepo, packageManager.name)

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

      const { lint } = initOptions

      const presets = Option.match(lint, {
        onNone: (): readonly LintPreset[] => [],
        onSome: (setup) => setup.presets,
      })

      // What init was asked to set up, in the order of each source list.
      const asked = {
        agents: initOptions.agents,
        ci: Option.isSome(initOptions.githubActions) ? "github" : null,
        editors: Option.match(initOptions.editors, {
          onNone: () => [],
          onSome: (names) => INIT_EDITORS.filter((editor) => names.includes(editor)),
        }),
        presets: Option.isSome(lint)
          ? ["core", ...LINT_PRESETS.filter((preset) => presets.includes(preset))]
          : [],
        scripts: SCRIPT_ORDER.filter((script) => initOptions.scripts.includes(script)),
        typescript: Option.getOrNull(initOptions.typescript),
      } satisfies Selection

      const selection = Option.match(recorded, {
        onNone: () => asked,
        onSome: (lockfile) => addSelection(lockfile.selection, asked),
      })

      // Zed installs extensions only from the user settings, so init links them.
      if (Option.exists(initOptions.editors, (names) => names.includes("zed"))) {
        yield* printZedExtensions(presets)
      }

      yield* applySetup("init", yield* readProject(cwd), selection)

      yield* Output.outro("💠 Setup finished.")
    }).pipe(
      Effect.catchTag("QuitError", () => Output.cancel("Setup was cancelled.")),
      Mode.provide({ interactive: !options.nonInteractive, json })
    )
  })
)
