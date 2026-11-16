import * as Array from "effect/Array"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { validateInitOptions } from "#commands/init/options.ts"
import { collectInteractiveInitOptions } from "#commands/init/prompts.ts"
import { applySetup } from "#commands/setup.ts"
import { DependencyInstaller } from "#lib/project/dependency-installer.ts"
import { readLockfile } from "#lib/project/lockfile.ts"
import { checkIsMonorepo } from "#lib/project/monorepo.ts"
import { SCRIPT_ORDER } from "#lib/project/package-json.ts"
import { SUPPORTED_PACKAGE_MANAGERS } from "#lib/project/package-manager.ts"
import { readProject } from "#lib/project/project.ts"
import {
  addSelection,
  INIT_EDITORS,
  LINT_PRESETS,
  type LintPreset,
  type Selection,
  TYPESCRIPT_PRESET_NAMES,
} from "#lib/project/selection.ts"
import { Cwd } from "#lib/shared/cwd.ts"
import { CommandFailed, InvalidInitOptions, NoPackageManager } from "#lib/shared/errors.ts"
import * as Mode from "#terminal/mode.ts"
import * as Output from "#terminal/output.ts"
import { printTitle } from "#terminal/title.ts"

const nonInteractive = Flag.Boolean("non-interactive").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Configure without prompts. Select at least one --script or --typescript")
)

const scripts = Flag.Literals("script", SCRIPT_ORDER).pipe(
  Flag.atMost(SCRIPT_ORDER.length),
  Flag.withDescription(
    "Set a package script to its Adamantite command, replacing what it ran. Repeat --script to add more"
  )
)

const presets = Flag.Literals("preset", LINT_PRESETS).pipe(
  Flag.atMost(LINT_PRESETS.length),
  Flag.withDescription(
    "Select an Oxlint preset. Repeat --preset to add more. Requires --script check or --script fix"
  )
)

const editors = Flag.Literals("editor", INIT_EDITORS).pipe(
  Flag.atMost(INIT_EDITORS.length),
  Flag.withDescription("Configure an editor. Repeat --editor to add more")
)

const typescript = Flag.Literals("typescript", TYPESCRIPT_PRESET_NAMES).pipe(
  Flag.optional,
  Flag.withDescription(
    "Use a TypeScript preset: typescript for strict types, tsconfig for strict config"
  )
)

const githubActions = Flag.Boolean("github-actions").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    `Add a GitHub Actions workflow. Requires --script check or --script analyze and ${new Intl.ListFormat("en-US", { type: "disjunction" }).format(SUPPORTED_PACKAGE_MANAGERS)}`
  )
)

const agents = Flag.Boolean("agents").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    "Add Adamantite guidance to AGENTS.md and the Adamantite skill to the skill folders of your coding agents"
  )
)

export default Command.make("init", {
  agents,
  editors,
  githubActions,
  json: Mode.json,
  nonInteractive,
  presets,
  scripts,
  typescript,
}).pipe(
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
  Command.withHandler(({ json, nonInteractive, ...setupFlags }) =>
    Effect.gen(function* () {
      const cwd = yield* Cwd
      // Only a terminal that can prompt asks for the selection. With `--json`,
      // `--non-interactive`, or no such terminal, init sets up from the flags.
      const prompts = Mode.is("Menu")(yield* Mode.CurrentMode)
      yield* printTitle

      yield* Output.intro("💠 adamantite init")

      // First, so a lockfile that does not read fails init before it changes a file.
      const recorded = yield* readLockfile(cwd)

      const packageManager = yield* (yield* DependencyInstaller).detectPackageManager(cwd).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new NoPackageManager({})),
            onSome: Effect.succeed,
          })
        )
      )

      yield* Output.info(`Detected package manager: ${packageManager.name}`)

      const isMonorepo = yield* checkIsMonorepo(cwd)

      if (isMonorepo) {
        yield* Output.info("This project is a monorepo.")
      }

      if (
        prompts
        && Array.some(
          [
            setupFlags.scripts.length > 0,
            setupFlags.presets.length > 0,
            setupFlags.editors.length > 0,
            Option.isSome(setupFlags.typescript),
            setupFlags.githubActions,
            setupFlags.agents,
          ],
          Predicate.isTruthy
        )
      ) {
        return yield* new InvalidInitOptions({
          reason: "Setup flags require `--non-interactive`.",
        })
      }

      if (!prompts && setupFlags.scripts.length === 0 && Option.isNone(setupFlags.typescript)) {
        return yield* new InvalidInitOptions({
          reason:
            "Select at least one script with `--script <name>`, or a TypeScript preset with `--typescript <preset>`.",
        })
      }

      const input = prompts ? yield* collectInteractiveInitOptions(isMonorepo) : setupFlags

      const initOptions = yield* validateInitOptions(input, packageManager.name)

      // GitHub Actions needs a script, so a run without scripts, TypeScript, editors, and agent
      // guidance selects no setup at all.
      if (
        initOptions.scripts.length === 0
        && Option.isNone(initOptions.typescript)
        && Option.isNone(initOptions.editors)
        && !initOptions.agents
      ) {
        yield* Output.outro("✅ No setup selected, so Adamantite made no changes.")

        return
      }

      const { lint } = initOptions

      const lintPresets = Option.match(lint, {
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
          ? ["core", ...LINT_PRESETS.filter((preset) => lintPresets.includes(preset))]
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
        yield* Output.info("Install the Zed `oxc` extension: zed://extension/oxc")

        if (lintPresets.includes("effect")) {
          yield* Output.info(
            "Install the Zed TypeScript language server extension: zed://extension/tsgo"
          )
        }
      }

      yield* applySetup("init", yield* readProject(cwd), selection)

      yield* Output.outro("✅ Setup finished.")
    }).pipe(
      // A cancel exits 1, as in the other commands.
      Effect.catchTag("QuitError", () =>
        Output.cancel("Setup was cancelled.").pipe(
          Effect.andThen(
            new CommandFailed({ command: "init", exitCode: ChildProcessSpawner.ExitCode(1) })
          )
        )
      ),
      Mode.provide({ interactive: !nonInteractive, json })
    )
  )
)
