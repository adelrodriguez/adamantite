import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import type { OverridesReport } from "#lib/hardening/overrides.ts"
import type { RuleSuppressions } from "#lib/hardening/suppressions.ts"
import { type AgentReach, readAgentReach } from "#lib/hardening/agent-reach.ts"
import { getHardenPromptTemplate } from "#lib/hardening/harden-prompt.macro.ts" with { type: "macro" }
import { listProjectFiles } from "#lib/hardening/project-files.ts"
import { fillTemplate } from "#lib/shared/template.ts"
import { discoverCustomRules } from "#lib/workspace/custom-rules/discover.ts"
import { CUSTOM_RULES_DIRECTORY } from "#lib/workspace/custom-rules/index.ts"
import { getWorkspacePackageDirectories } from "#lib/workspace/monorepo.ts"

const hardenPromptTemplate = getHardenPromptTemplate()

/**
 * Each coding agent starts from `AGENTS.md`, and `AGENTS.md` points to the other documentation.
 * Harden does not read the instruction files of one vendor, such as `CLAUDE.md`, as instructions.
 */
const AGENTS_FILE = "AGENTS.md"

/**
 * Changesets and changelogs record releases, not coding standards. Git separates the folders of a
 * path with `/` on each platform.
 */
function isDocumentation(file: string) {
  const segments = file.split("/")

  return !segments.includes(".changeset") && segments.at(-1) !== "CHANGELOG.md"
}

/**
 * The files that a harden session starts from. Paths are relative to the project root.
 */
interface HardenContext {
  /**
   * Which Markdown files each `AGENTS.md` reaches, or none when git cannot list them.
   */
  readonly agentReach: Option.Option<AgentReach>
  readonly configs: readonly string[]
  /**
   * The Markdown files of the project, or none when git cannot list them.
   */
  readonly documentationFiles: Option.Option<readonly string[]>
  readonly instructionFiles: readonly string[]
  readonly rulesFolders: readonly string[]
  /**
   * The folder that `--path` selects, or `null` for the whole project.
   */
  readonly scope: string | null
  /**
   * Files with a `custom()` call whose `dir` is not a string literal, so only the agent can find
   * its rules folder.
   */
  readonly unresolvedCalls: readonly string[]
}

/**
 * Reads the harden context of the root and each workspace package. A `scope` keeps the packages
 * inside that folder, or the package that contains it. The context keeps the configs that lint
 * those packages, an ancestor config included, and the rules folders that those configs load, also
 * when they are outside the scope. A scope also keeps the Markdown files outside each workspace
 * package, because the root documentation applies to every package.
 */
export const readHardenContext = Effect.fn("readHardenContext")(function* (
  cwd: string,
  scope: string = cwd
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const relative = (target: string) => path.relative(cwd, target) || "."
  const contains = (folder: string, target: string) => {
    const fromFolder = path.relative(folder, target)

    return (
      fromFolder !== ".." && !fromFolder.startsWith(`..${path.sep}`) && !path.isAbsolute(fromFolder)
    )
  }
  const readPackages = Effect.gen(function* () {
    const packageDirectories = [cwd, ...(yield* getWorkspacePackageDirectories(cwd))]
    const packagesInScope = packageDirectories.filter((directory) => contains(scope, directory))
    // The innermost package that contains the scope, when the scope holds no package of its own.
    const owner = Array.sort(
      packageDirectories.filter((directory) => contains(directory, scope)),
      Order.mapInput(Order.flip(Order.Number), (directory: string) => directory.length)
    ).slice(0, 1)
    const selectedPackages = packagesInScope.length > 0 ? packagesInScope : owner
    // The root instructions apply to every package, so a scope keeps them.
    const instructionCandidates = [...new Set([cwd, ...selectedPackages])].map((directory) =>
      path.join(directory, AGENTS_FILE)
    )
    const [discovery, instructionFiles] = yield* Effect.all(
      [
        discoverCustomRules(packageDirectories, selectedPackages),
        Effect.filter(
          instructionCandidates,
          (file) => fs.exists(file).pipe(Effect.orElseSucceed(() => false)),
          { concurrency: "unbounded" }
        ),
      ],
      { concurrency: "unbounded" }
    )

    return {
      discovery,
      instructionFiles,
      packageDirectories,
      selectedPackages,
    }
  })
  // A root file can link to the files of each package, so the reach reads the whole project. It
  // starts from the `AGENTS.md` files that an agent in the scope reads: the ones in the folders
  // above the scope, and the ones inside it, but not the ones of a sibling package.
  const isReadInScope = (file: string) => {
    const folder = path.dirname(path.join(cwd, file))

    return contains(folder, scope) || contains(scope, folder)
  }
  const readDocumentation = Effect.gen(function* () {
    // The git index also has the files that a delete or a sparse checkout left out of the working
    // tree, and the agent cannot read those.
    const markdownFiles = yield* Effect.transposeOption(
      (yield* listProjectFiles(cwd, ["*.md", "*.mdx", "*.mdc"])).pipe(
        Option.map((files) =>
          Effect.forEach(
            files.filter((file) => isDocumentation(file)),
            (file) =>
              fs.exists(path.join(cwd, file)).pipe(
                Effect.orElseSucceed(() => false),
                Effect.map((exists) => (exists ? [file] : []))
              ),
            { concurrency: "unbounded" }
          ).pipe(Effect.map((files) => files.flat()))
        )
      )
    )
    const agentReach = yield* Effect.transposeOption(
      markdownFiles.pipe(
        Option.map((files) =>
          readAgentReach(
            cwd,
            files,
            files.filter((file) => path.basename(file) === AGENTS_FILE && isReadInScope(file))
          )
        )
      )
    )

    return { agentReach, markdownFiles }
  })
  // Git lists the Markdown files while discovery reads the workspace packages.
  const [
    { discovery, instructionFiles, packageDirectories, selectedPackages },
    { agentReach, markdownFiles },
  ] = yield* Effect.all([readPackages, readDocumentation], { concurrency: "unbounded" })
  const { calls, configs, unresolvedCalls } = discovery

  // The innermost package that contains the file owns it.
  const isSelected = (file: string) => {
    const [innermost = cwd] = Array.sort(
      packageDirectories.filter((directory) => contains(directory, file)),
      Order.mapInput(Order.flip(Order.Number), (directory: string) => directory.length)
    )

    return innermost === cwd || selectedPackages.includes(innermost)
  }
  const isSelectedFile = (file: string) => isSelected(path.join(cwd, file))

  return {
    agentReach: agentReach.pipe(
      Option.map((reach) => ({
        brokenLinks: reach.brokenLinks.filter((link) => isSelectedFile(link.file)),
        unreached: reach.unreached.filter((file) => isSelectedFile(file)),
      }))
    ),
    configs: configs.map((config) => relative(config)),
    documentationFiles: markdownFiles.pipe(
      Option.map((files) => files.filter((file) => isSelectedFile(file)))
    ),
    instructionFiles: instructionFiles.map((file) => relative(file)),
    rulesFolders: [...new Set(calls.map((call) => relative(call.dir)))],
    scope: scope === cwd ? null : relative(scope),
    unresolvedCalls: [...new Set(unresolvedCalls.map((source) => relative(source)))],
  } satisfies HardenContext
})

const SHELL_SAFE = /^[\w./-]+$/u

/**
 * Quotes a path for a POSIX shell when it has a character that the shell splits or reads, such as a
 * space or a parenthesis.
 */
function quoteShellArgument(argument: string) {
  return SHELL_SAFE.test(argument) ? argument : `'${argument.replaceAll("'", "'\\''")}'`
}

function renderList(paths: readonly string[], empty: string) {
  return paths.length === 0 ? empty : paths.map((file) => `- \`${file}\``).join("\n")
}

function renderAgentReach(reach: AgentReach) {
  const unreached =
    reach.unreached.length === 0
      ? "Links and code spans from each `AGENTS.md` reach each Markdown file."
      : `No chain of links or code spans from an \`AGENTS.md\` reaches these Markdown files:\n\n${renderList(reach.unreached, "")}`
  const brokenLinks =
    reach.brokenLinks.length === 0
      ? []
      : [
          `These links go to Markdown files that do not exist:\n\n${reach.brokenLinks
            .map((link) => `- \`${link.file}\` links to \`${link.target}\``)
            .join("\n")}`,
        ]

  return [unreached, ...brokenLinks].join("\n\n")
}

function renderRulesFolders(context: HardenContext) {
  if (context.rulesFolders.length === 0 && context.unresolvedCalls.length === 0) {
    return `No \`custom()\` call loads a rules folder. Before you write the first custom rule, add \`custom()\` from \`adamantite/lint/custom\` to the \`extends\` of the Oxlint config. It loads \`${CUSTOM_RULES_DIRECTORY}\` by default.`
  }

  return [
    ...context.rulesFolders.map((folder) => `- \`${folder}\``),
    ...context.unresolvedCalls.map(
      (file) =>
        `- A \`custom()\` call in \`${file}\` whose \`dir\` is not a string literal. Read the config to find its rules folder.`
    ),
  ].join("\n")
}

/**
 * The locations of the disable comments that the prompt shows for each rule. The agent reads the
 * other comments with the command in the fallback text.
 */
const SHOWN_SUPPRESSIONS = 5

function renderSuppressions(suppressions: Option.Option<readonly RuleSuppressions[]>) {
  return Option.match(suppressions, {
    onNone: () =>
      'Adamantite could not count the comments that turn a rule off, because Oxlint could not list the files that it lints. Count them yourself, for example with `rg -n "(oxlint|eslint)-disable"`, and leave out the files that the config ignores.',
    onSome: (rules) => {
      if (rules.length === 0) {
        return "No `oxlint-disable` or `eslint-disable` comment turns a rule off."
      }

      const lines = rules.map(({ locations, rule }) => {
        const name = Option.match(rule, {
          onNone: () => "All rules",
          onSome: (ruleName) => `\`${ruleName}\``,
        })
        const shown = locations
          .slice(0, SHOWN_SUPPRESSIONS)
          .map((location) => `\`${location}\``)
          .join(", ")
        const more =
          locations.length > SHOWN_SUPPRESSIONS
            ? `, and ${locations.length - SHOWN_SUPPRESSIONS} more`
            : ""

        return `- ${name}: ${locations.length} ${locations.length === 1 ? "comment" : "comments"}, in ${shown}${more}`
      })

      return [
        "Adamantite counted the `oxlint-disable` and `eslint-disable` comments of each rule in the files that Oxlint lints. Oxlint obeys both. A comment that names no rule turns off all rules.",
        "",
        ...lines,
      ].join("\n")
    },
  })
}

const OVERRIDE_MARKS = {
  breaks: "still breaks the rule",
  clean: "no longer breaks the rule",
  ignored: "the config ignores it, so Oxlint did not lint it",
  missing: "does not exist",
  unparsable: "does not parse, so Oxlint did not lint it",
} as const

function renderOverrides(report: OverridesReport) {
  if (report._tag === "Failed") {
    return [
      "Adamantite could not lint the files of the overrides that turn a rule off:",
      "",
      "```text",
      report.reason,
      "```",
      "",
      "For each file in an override that turns a rule off, read the file and find the code that the rule reports.",
    ].join("\n")
  }

  if (report.rules.length === 0) {
    return "No override in the Oxlint config turns a rule off for files that it names."
  }

  return [
    "Adamantite turned each rule on again in a copy of the project, and linted each file that an override names and turns the rule off for. Paths are relative to the project root. An override that code builds, such as a spread, is not in this list.",
    "",
    ...report.rules.map(({ config, files, globs, rule }) =>
      [
        `- \`${rule}\` in \`${config}\`:`,
        ...files.map(({ file, mark }) => `  - \`${file}\`: ${OVERRIDE_MARKS[mark]}`),
        ...globs.map((glob) => `  - \`${glob}\`: a glob, so Adamantite did not lint its files`),
      ].join("\n")
    ),
  ].join("\n")
}

/**
 * The number of recent commits that the agent reads for fixed mistakes when `--commits` is not set.
 */
export const DEFAULT_FIX_HISTORY_COMMITS = 200

interface RenderHardenPromptOptions {
  readonly adamantiteVersion: string
  /**
   * The number of recent commits that the agent reads for fixed mistakes.
   */
  readonly commits: number
  readonly overrides: OverridesReport
  readonly suppressions: Option.Option<readonly RuleSuppressions[]>
}

/**
 * The Markdown prompt that a coding agent follows to harden the project. Code renders the detected
 * files, the facts that Adamantite computes, and the commands; `harden-prompt.md` holds the rest.
 */
export function renderHardenPrompt(
  context: HardenContext,
  { adamantiteVersion, commits, overrides, suppressions }: RenderHardenPromptOptions
): string {
  // `.` keeps the history to the project folder when the project is a folder of a larger repository.
  const fixHistoryPath = quoteShellArgument(context.scope ?? ".")

  return fillTemplate(hardenPromptTemplate, {
    agentReach: Option.match(context.agentReach, {
      onNone: () =>
        "Adamantite could not find which files each `AGENTS.md` reaches, because git could not list the files. Follow the links from each `AGENTS.md` yourself.",
      onSome: (reach) => renderAgentReach(reach),
    }),
    configs: renderList(
      context.configs,
      "No Oxlint config was found. When you show the candidates, tell the user to run `adamantite init` before step 9."
    ),
    documentationFiles: Option.match(context.documentationFiles, {
      onNone: () =>
        "Git could not list the files of this project. Find the Markdown files with a file search, and leave out the dependencies, the build output, the changesets, and the changelogs.",
      onSome: (files) => renderList(files, "The project has no Markdown file."),
    }),
    fixHistoryCommand: `\`git log -n ${commits} --no-merges --format="%h %s" -- ${fixHistoryPath}\``,
    instructionFiles: renderList(
      context.instructionFiles,
      "No `AGENTS.md` was found. Each file that states a standard is a discovery gap, and the root `AGENTS.md` must point to it."
    ),
    overrides: renderOverrides(overrides),
    rulesFolders: renderRulesFolders(context),
    scope:
      context.scope === null
        ? "Adamantite found these files in the project and its workspace packages. Paths are relative to the project root."
        : `Adamantite found these files for \`${context.scope}\`, the folder that \`--path\` selects. Survey only the code in this folder. Paths are relative to the project root.`,
    suppressions: renderSuppressions(suppressions),
    version: adamantiteVersion,
  })
}
