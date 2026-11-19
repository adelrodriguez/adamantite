import type * as Terminal from "effect/Terminal"
import * as Array from "effect/Array"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Prompt from "effect/cli/Prompt"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { applySetup } from "#commands/setup.ts"
import oxlint, { findParentConfig } from "#lib/integrations/oxlint/index.ts"
import {
  describeLintPreset,
  findExcludedPresets,
  findMissingRequiredPresets,
  lintPresets,
} from "#lib/integrations/oxlint/presets.ts"
import { DependencyInstaller } from "#lib/project/dependency-installer.ts"
import * as Project from "#lib/project/index.ts"
import { readLockfile } from "#lib/project/lockfile.ts"
import {
  checkRunsTool,
  hasCICompatibleScripts,
  SCRIPT_ORDER,
  type Script,
} from "#lib/project/package-json.ts"
import {
  SUPPORTED_PACKAGE_MANAGERS,
  type SupportedPackageManager,
} from "#lib/project/package-manager.ts"
import {
  addSelection,
  INIT_EDITORS,
  type InitEditor,
  LINT_PRESETS,
  type LintPreset,
  type Selection,
  TYPESCRIPT_PRESET_NAMES,
  type TypeScriptPreset,
} from "#lib/project/selection.ts"
import {
  CommandFailed,
  InvalidInitOptions,
  NoPackageManager,
  ParentOxlintConfig,
} from "#lib/shared/errors.ts"
import * as Mode from "#terminal/mode.ts"
import * as Output from "#terminal/output.ts"
import { printTitle } from "#terminal/title.ts"

export interface InitOptions {
  readonly agents: boolean
  readonly editors: Option.Option<Array.NonEmptyReadonlyArray<InitEditor>>
  readonly githubActions: Option.Option<SupportedPackageManager>
  readonly lint: Option.Option<{
    readonly presets: readonly LintPreset[]
  }>
  readonly scripts: readonly Script[]
  readonly typescript: Option.Option<TypeScriptPreset>
}

interface InitOptionsInput {
  readonly agents: boolean
  readonly editors: readonly InitEditor[]
  readonly githubActions: boolean
  readonly presets: readonly LintPreset[]
  readonly scripts: readonly Script[]
  readonly typescript: Option.Option<TypeScriptPreset>
}

const parseInitOptions = Effect.fn("parseInitOptions")(function* (
  input: InitOptionsInput,
  packageManager: SupportedPackageManager
) {
  const options = {
    agents: input.agents,
    editors: Array.dedupe(input.editors),
    githubActions: input.githubActions,
    presets: Array.dedupe(input.presets),
    scripts: Array.dedupe(input.scripts),
    typescript: input.typescript,
  }

  const hasOxlint = checkRunsTool(options.scripts, "oxlint")

  if (options.presets.length > 0 && !hasOxlint) {
    return yield* new InvalidInitOptions({
      reason: "`--preset` requires the `check` or `fix` script.",
    })
  }

  const missingPreset = Array.head(findMissingRequiredPresets(options.presets))

  if (Option.isSome(missingPreset)) {
    const { required, requiredBy } = missingPreset.value

    return yield* new InvalidInitOptions({
      reason: `\`--preset ${requiredBy}\` requires \`--preset ${required}\`.`,
    })
  }

  const excludedPreset = Array.head(findExcludedPresets(options.presets))

  if (Option.isSome(excludedPreset)) {
    const { excluded, preset } = excludedPreset.value

    return yield* new InvalidInitOptions({
      reason: `\`--preset ${preset}\` and \`--preset ${excluded}\` report the same defects. Select one of them.`,
    })
  }

  if (options.githubActions && !hasCICompatibleScripts(options.scripts)) {
    return yield* new InvalidInitOptions({
      reason: "`--github-actions` requires --script check or --script analyze.",
    })
  }

  return {
    agents: options.agents,
    editors: Array.isReadonlyArrayNonEmpty(options.editors)
      ? Option.some(options.editors)
      : Option.none(),
    githubActions: options.githubActions ? Option.some(packageManager) : Option.none(),
    lint: hasOxlint ? Option.some({ presets: options.presets }) : Option.none(),
    scripts: options.scripts,
    typescript: options.typescript,
  } satisfies InitOptions
})

const INIT_EDITOR_CHOICES = {
  vscode: {
    description:
      "creates .vscode/settings.json and .vscode/extensions.json for VS Code, Cursor, Windsurf, and more",
    title: "Universal",
  },
  zed: { description: "creates .zed/settings.json", title: "Zed" },
} as const satisfies Record<InitEditor, { description: string; title: string }>

function keepOneOfExcludedPresets(
  selected: readonly LintPreset[]
): Effect.Effect<readonly LintPreset[], Terminal.QuitError, Prompt.Environment> {
  return Option.match(Array.head(findExcludedPresets(selected)), {
    onNone: () => Effect.succeed(selected),
    onSome: ({ excluded, preset }) =>
      Effect.gen(function* () {
        const kept = yield* Prompt.Select({
          choices: [preset, excluded].map((name) => ({ title: name, value: name })),
          message: `The ${preset} and ${excluded} presets report the same defects. Which one should Adamantite use?`,
        })

        return yield* keepOneOfExcludedPresets(
          selected.filter((name) => name === kept || (name !== preset && name !== excluded))
        )
      }),
  })
}

const promptPresets = Effect.gen(function* () {
  const chosen = yield* Prompt.MultiSelect({
    choices: lintPresets.map((preset) => ({
      description: describeLintPreset(preset),
      title: preset.label,
      value: preset.name,
    })),
    message: "Which presets should Adamantite use with the core preset?",
  })

  const selected = yield* keepOneOfExcludedPresets(chosen)

  const missingPresets = findMissingRequiredPresets(selected)

  for (const { required, requiredBy } of missingPresets) {
    yield* Output.info(`Added the \`${required}\` preset, which \`${requiredBy}\` requires.`)
  }

  return [...missingPresets.map(({ required }) => required), ...selected]
})

const collectInteractiveInitOptions = Effect.fn("collectInteractiveInitOptions")(function* (
  isMonorepo: boolean
) {
  const selectedScripts = yield* Prompt.MultiSelect({
    choices: [
      {
        description: "recommended",
        selected: true,
        title: "check - find formatting, lint, and type errors",
        value: "check",
      },
      {
        description: "recommended",
        selected: true,
        title: "fix - apply safe lint fixes and format code",
        value: "fix",
      },
      {
        title: isMonorepo
          ? "analyze - find unused code and check monorepo consistency"
          : "analyze - find unused dependencies, exports, and files",
        value: "analyze",
      },
    ],
    message:
      "Which scripts should Adamantite set in `package.json`? It replaces what a selected script runs.",
  })

  const hasOxlint = checkRunsTool(selectedScripts, "oxlint")
  const selectedPresets = hasOxlint ? yield* promptPresets : []

  const shouldSetupTypescript = yield* Prompt.Confirm({
    initial: true,
    message: "Use an Adamantite TypeScript preset?",
  })

  const typescriptPreset = shouldSetupTypescript
    ? Option.some(
        yield* Prompt.Select<TypeScriptPreset>({
          choices: [
            {
              description: "JSON.parse() returns unknown, not any. Avoid in libraries.",
              title: "Strict types",
              value: "typescript",
            },
            {
              description: "No changes to built-in types. Use for libraries.",
              title: "Strict config",
              value: "tsconfig",
            },
          ],
          message: "Which TypeScript preset should Adamantite use?",
        })
      )
    : Option.none()

  const selectedEditors = yield* Prompt.MultiSelect({
    choices: INIT_EDITORS.map((editor) => ({ ...INIT_EDITOR_CHOICES[editor], value: editor })),
    message: "Which editors should Adamantite configure?",
  })

  const shouldEnableGitHubActions = hasCICompatibleScripts(selectedScripts)
    ? yield* Prompt.Confirm({
        initial: true,
        message: "Add a GitHub Actions workflow to run the selected checks?",
      })
    : false

  const shouldSetupAgents = yield* Prompt.Confirm({
    initial: true,
    message:
      "Teach coding agents to use Adamantite? This adds an AGENTS.md section and the Adamantite skills.",
  })

  return {
    agents: shouldSetupAgents,
    editors: selectedEditors,
    githubActions: shouldEnableGitHubActions,
    presets: selectedPresets,
    scripts: selectedScripts,
    typescript: typescriptPreset,
  } satisfies InitOptionsInput
})

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

// The first `Intl` formatter loads ICU's data, and the CLI builds this description at startup.
const githubActions = Flag.Boolean("github-actions").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    `Add a GitHub Actions workflow. Requires --script check or --script analyze and ${Array.initNonEmpty(SUPPORTED_PACKAGE_MANAGERS).join(", ")}, or ${Array.lastNonEmpty(SUPPORTED_PACKAGE_MANAGERS)}`
  )
)

const agents = Flag.Boolean("agents").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    "Add Adamantite guidance to AGENTS.md and the Adamantite skills to the skill folders of your coding agents"
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
        "Configure a React project with VS Code, TypeScript, CI, agent guidance, and the Adamantite skills",
    },
    {
      command: "adamantite init --non-interactive --script analyze",
      description: "Configure analysis, including Sherif checks for a monorepo",
    },
  ]),
  Command.withHandler(({ json, nonInteractive, ...setupFlags }) =>
    Effect.gen(function* () {
      const cwd = yield* Project.Directory
      const prompts = Mode.is("Menu")(yield* Mode.CurrentMode)
      yield* printTitle

      yield* Output.intro("💠 adamantite init")

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

      const isMonorepo = yield* Project.checkIsMonorepo()

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

      const initOptions = yield* parseInitOptions(input, packageManager.name)

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

      const selectedPresets = Option.match(lint, {
        onNone: (): readonly LintPreset[] => [],
        onSome: (setup) => setup.presets,
      })

      const asked = {
        agents: initOptions.agents,
        ci: Option.isSome(initOptions.githubActions) ? "github" : null,
        editors: Option.match(initOptions.editors, {
          onNone: () => [],
          onSome: (names) => INIT_EDITORS.filter((editor) => names.includes(editor)),
        }),
        presets: Option.isSome(lint)
          ? ["core", ...LINT_PRESETS.filter((preset) => selectedPresets.includes(preset))]
          : [],
        scripts: SCRIPT_ORDER.filter((script) => initOptions.scripts.includes(script)),
        typescript: Option.getOrNull(initOptions.typescript),
      } satisfies Selection

      const selection = Option.match(recorded, {
        onNone: () => asked,
        onSome: (lockfile) => addSelection(lockfile.selection, asked),
      })

      // Oxlint loads the config that init writes as a nested config of a parent project, and fails
      // on its `options`.
      if (oxlint.selected(selection)) {
        const parent = yield* findParentConfig(cwd)

        if (Option.isSome(parent)) {
          return yield* new ParentOxlintConfig({ path: parent.value })
        }
      }

      // Zed installs extensions only from the user settings.
      if (Option.exists(initOptions.editors, (names) => names.includes("zed"))) {
        yield* Output.info("Install the Zed `oxc` extension: zed://extension/oxc")

        if (selectedPresets.includes("effect")) {
          yield* Output.info(
            "Install the Zed TypeScript language server extension: zed://extension/tsgo"
          )
        }
      }

      yield* applySetup("init", yield* Project.read(), selection)

      yield* Output.outro("✅ Setup finished.")
    }).pipe(
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
