import * as Array from "effect/Array"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import type * as Project from "#lib/project/index.ts"
import { AgentReach, readAgentReach } from "#lib/hardening/agent-reach.ts"
import {
  type Decision,
  DecisionsRecord,
  findCoveringSession,
  readDecisionsRecord,
} from "#lib/hardening/decisions-record.ts"
import {
  getEnforcementLadder,
  getHardenPromptTemplate,
} from "#lib/hardening/harden-prompt.macro.ts" with { type: "macro" }
import { OverridesLintFailed, OverridesReport, readOverrides } from "#lib/hardening/overrides.ts"
import {
  listProjectFiles,
  ProjectPath,
  readHead,
  readMergeBase,
  toProjectPath,
} from "#lib/hardening/project-files.ts"
import { readSuppressions, Suppressions } from "#lib/hardening/suppressions.ts"
import { skillFolders } from "#lib/integrations/agents/skill.ts"
import { discoverCustomRules } from "#lib/project/custom-rules/discover.ts"
import { checkExists } from "#lib/shared/filesystem.ts"
import { CUSTOM_RULES_SECTION, HARDENING_SKILL } from "#lib/shared/skill.ts"
import { fillTemplate } from "#lib/shared/template.ts"
import { DEFAULT_DIRECTORY } from "#presets/rules/folder.ts"

const hardenPromptTemplate = getHardenPromptTemplate()
const enforcementLadder = getEnforcementLadder()

const AGENTS_FILE = "AGENTS.md"

function isDocumentation(file: string) {
  // Git separates the folders of a path with `/` on each platform.
  const segments = file.split("/")

  return (
    !segments.includes(".changeset")
    && segments.at(-1) !== "CHANGELOG.md"
    && !skillFolders.some((folder) => `/${file}`.includes(`/${folder}/`))
  )
}

export const DEFAULT_FIX_HISTORY_COMMITS = 200

const FixHistory = Schema.TaggedUnion({
  Last: { count: Schema.Int },
  Requested: { count: Schema.Int },
  Since: { boundary: Schema.String, head: Schema.String, session: Schema.String },
})

type FixHistory = typeof FixHistory.Type

const { Last, Requested, Since } = Data.taggedEnum<FixHistory>()

export const HardenContext = Schema.Struct({
  agentReach: Schema.OptionFromNullOr(AgentReach),
  configs: Schema.Array(ProjectPath),
  decisionsRecord: DecisionsRecord,
  documentationFiles: Schema.OptionFromNullOr(Schema.Array(Schema.String)),
  fixHistory: FixHistory,
  head: Schema.OptionFromNullOr(Schema.String),
  instructionFiles: Schema.Array(Schema.String),
  overrides: OverridesReport,
  rulesFolders: Schema.Array(Schema.String),
  scope: Schema.NullOr(ProjectPath),
  suppressions: Schema.OptionFromNullOr(Suppressions),
  unloadedConfigs: Schema.Array(Schema.String),
})

export type HardenContext = typeof HardenContext.Type

function selectPackages(path: Path.Path, cwd: string, workspace: Project.Workspace, scope: string) {
  function contains(folder: string, target: string) {
    const fromFolder = path.relative(folder, target)

    return (
      fromFolder !== ".." && !fromFolder.startsWith(`..${path.sep}`) && !path.isAbsolute(fromFolder)
    )
  }

  const byDepth = Order.mapInput(Order.flip(Order.Number), (directory: string) => directory.length)
  const packageDirectories = [cwd, ...workspace.packageDirectories]
  const packagesInScope = packageDirectories.filter((directory) => contains(scope, directory))

  const owner = Array.sort(
    packageDirectories.filter((directory) => contains(directory, scope)),
    byDepth
  ).slice(0, 1)

  const selectedPackages = packagesInScope.length > 0 ? packagesInScope : owner

  function isSelectedFile(file: string) {
    const [innermost = cwd] = Array.sort(
      packageDirectories.filter((directory) => contains(directory, path.join(cwd, file))),
      byDepth
    )

    return innermost === cwd || selectedPackages.includes(innermost)
  }

  return { contains, isSelectedFile, packageDirectories, selectedPackages }
}

const readScopedDocumentation = Effect.fn("readScopedDocumentation")(function* (
  cwd: string,
  workspace: Project.Workspace,
  scope: string
) {
  const path = yield* Path.Path
  const { contains, isSelectedFile } = selectPackages(path, cwd, workspace, scope)

  function isReadInScope(file: string) {
    const folder = path.dirname(path.join(cwd, file))

    return contains(folder, scope) || contains(scope, folder)
  }

  // The git index also has the files that a delete or a sparse checkout left out of the working
  // tree, and the agent cannot read those.
  const markdownFiles = yield* Effect.transposeOption(
    (yield* listProjectFiles(cwd, ["*.md", "*.mdx", "*.mdc"])).pipe(
      Option.map((files) =>
        Effect.forEach(
          files.filter((file) => isDocumentation(file)),
          (file) =>
            checkExists(path.join(cwd, file)).pipe(Effect.map((exists) => (exists ? [file] : []))),
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

  return {
    agentReach: agentReach.pipe(
      Option.map((reach) => ({
        brokenLinks: reach.brokenLinks.filter((link) => isSelectedFile(link.file)),
        unmatchedAnchors: reach.unmatchedAnchors.filter((link) => isSelectedFile(link.file)),
        unreached: reach.unreached.filter((file) => isSelectedFile(file)),
      }))
    ),
    documentationFiles: markdownFiles.pipe(
      Option.map((files) => files.filter((file) => isSelectedFile(file)))
    ),
  }
})

export const readHardenReach = Effect.fn("readHardenReach")(function* (
  cwd: string,
  workspace: Project.Workspace,
  scope: string = cwd
) {
  return (yield* readScopedDocumentation(cwd, workspace, scope)).agentReach
})

const readFixHistory = Effect.fn("readFixHistory")(function* (
  cwd: string,
  commits: Option.Option<number>,
  record: DecisionsRecord,
  scope: ProjectPath | null
) {
  if (Option.isSome(commits)) {
    return Requested({ count: commits.value })
  }

  const covering = findCoveringSession(record, scope)

  if (Option.isNone(covering)) {
    return Last({ count: DEFAULT_FIX_HISTORY_COMMITS })
  }

  const { head, session } = covering.value

  return Option.match(yield* readMergeBase(cwd, head), {
    onNone: () => Last({ count: DEFAULT_FIX_HISTORY_COMMITS }),
    onSome: (boundary) => Since({ boundary, head, session }),
  })
})

export const readHardenContext = Effect.fn("readHardenContext")(function* (
  cwd: string,
  workspace: Project.Workspace,
  scope: string,
  commits: Option.Option<number>
) {
  const path = yield* Path.Path

  function relative(target: string) {
    return path.relative(cwd, target) || "."
  }

  const { packageDirectories, selectedPackages } = selectPackages(path, cwd, workspace, scope)
  const projectScope = scope === cwd ? null : toProjectPath(path, cwd, scope)

  const instructionCandidates = [...new Set([cwd, ...selectedPackages])].map((directory) =>
    path.join(directory, AGENTS_FILE)
  )

  const [{ calls, configs, unloadedConfigs }, instructionFiles, documentation, decisionsRecord] =
    yield* Effect.all(
      [
        discoverCustomRules(cwd, packageDirectories, selectedPackages),
        Effect.filter(instructionCandidates, (file) => checkExists(file), {
          concurrency: "unbounded",
        }),
        readScopedDocumentation(cwd, workspace, scope),
        readDecisionsRecord(cwd, projectScope),
      ],
      { concurrency: "unbounded" }
    )

  const projectConfigs = configs.map((config) => toProjectPath(path, cwd, config))

  const [head, fixHistory] = yield* Effect.all(
    [readHead(cwd), readFixHistory(cwd, commits, decisionsRecord, projectScope)],
    { concurrency: "unbounded" }
  )

  const [overrides, suppressions] = yield* Effect.all(
    [
      readOverrides(cwd, workspace, projectConfigs, projectScope),
      readSuppressions(cwd, projectScope),
    ],
    { concurrency: "unbounded" }
  )

  return {
    agentReach: documentation.agentReach,
    configs: projectConfigs,
    decisionsRecord,
    documentationFiles: documentation.documentationFiles,
    fixHistory,
    head,
    instructionFiles: instructionFiles.map((file) => relative(file)),
    overrides,
    rulesFolders: Array.sort(Array.dedupe(calls.map((call) => relative(call.dir))), Order.String),
    scope: projectScope,
    suppressions,
    unloadedConfigs: unloadedConfigs.map(({ file }) => relative(file)),
  } satisfies HardenContext
})

const SHELL_SAFE = /^[\w./-]+$/u

function quoteShellArgument(argument: string) {
  return SHELL_SAFE.test(argument) ? argument : `'${argument.replaceAll("'", String.raw`'\''`)}'`
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

  const unmatchedAnchors =
    reach.unmatchedAnchors.length === 0
      ? []
      : [
          [
            "Adamantite could not match the anchors of these links to a heading of their Markdown file. It matches an anchor with a simple rule, the heading text as written and without link targets, HTML tags, and emphasis underscores, so it can list a link that works, such as one to a heading with an image, an HTML entity such as `&amp;`, or a code span with backticks inside it. For each link, open the target file, find the heading that the link means, and decide whether the link is broken. A broken link is a discovery gap, as step 1 describes. A link that works needs no change.",
            "",
            ...reach.unmatchedAnchors.map(
              (link) =>
                `- \`${link.file}\` links to \`${link.target}\` at the anchor \`#${link.anchor}\``
            ),
          ].join("\n"),
        ]

  return [unreached, ...brokenLinks, ...unmatchedAnchors].join("\n\n")
}

function renderRulesFolders(context: HardenContext) {
  if (context.rulesFolders.length === 0 && context.unloadedConfigs.length === 0) {
    return `No \`custom()\` call loads a rules folder. Before you write the first custom rule, add \`custom()\` from \`adamantite/rules\` to the \`extends\` of the Oxlint config. It loads \`${DEFAULT_DIRECTORY}\` by default.`
  }

  return [
    ...context.rulesFolders.map((folder) => `- \`${folder}\``),
    ...context.unloadedConfigs.map(
      (file) =>
        `- The rules folders that \`${file}\` loads. Node.js cannot load the config, so read it to find them.`
    ),
  ].join("\n")
}

const SHOWN_SUPPRESSIONS = 5

function renderCount(name: string, locations: readonly string[]) {
  const shown = locations
    .slice(0, SHOWN_SUPPRESSIONS)
    .map((location) => `\`${location}\``)
    .join(", ")

  const more =
    locations.length > SHOWN_SUPPRESSIONS
      ? `, and ${locations.length - SHOWN_SUPPRESSIONS} more`
      : ""

  return `- ${name}: ${locations.length} ${locations.length === 1 ? "comment" : "comments"}, in ${shown}${more}`
}

function renderSuppressions(suppressions: Option.Option<Suppressions>) {
  return Option.match(suppressions, {
    onNone: () =>
      'Adamantite could not count the comments that turn a rule or a type check off, because Oxlint could not list the files that it lints or read their comments. Count them yourself, for example with `rg -n "(oxlint|eslint)-disable|@ts-(expect-error|ignore|nocheck)"`, and leave out the files that the config ignores.',
    onSome: ({ directives, rules }) => {
      const lint =
        rules.length === 0
          ? "No `oxlint-disable` or `eslint-disable` comment turns a rule off."
          : [
              "Adamantite counted the `oxlint-disable` and `eslint-disable` comments of each rule in the files that Oxlint lints. Oxlint obeys both. A comment that names no rule turns off all rules.",
              "",
              ...rules.map(({ locations, rule }) =>
                renderCount(
                  Option.match(rule, {
                    onNone: () => "All rules",
                    onSome: (ruleName) => `\`${ruleName}\``,
                  }),
                  locations
                )
              ),
            ].join("\n")

      const types =
        directives.length === 0
          ? "No `@ts-expect-error`, `@ts-ignore`, or `@ts-nocheck` comment turns a type check off."
          : [
              "Adamantite counted the comments of each TypeScript directive in the same files, where TypeScript reads the directive.",
              "",
              ...directives.map(({ directive, locations }) =>
                renderCount(`\`${directive}\``, locations)
              ),
            ].join("\n")

      return [lint, types].join("\n\n")
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
  if (Schema.is(OverridesLintFailed)(report)) {
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

const REASON_LABELS = {
  decided: "Choice",
  deferred: "Reason",
  rejected: "Reason",
} as const satisfies Record<Decision["decision"], string>

function endSentence(text: string) {
  return /[!.?]$/u.test(text) ? text : `${text}.`
}

function renderDecision(decision: Decision) {
  const evidence = Array.getSomes([
    Option.map(decision.follow, (count) => `${count} follow`),
    Option.map(decision.break, (count) => `${count} break`),
    decision.fixes.pipe(
      Option.filter((fixes) => fixes.length > 0),
      Option.map((fixes) => `fixes ${fixes.join(", ")}`)
    ),
  ])

  const scope = Option.match(decision.scope, {
    onNone: () => "",
    onSome: (folder) => `, in \`${folder}\``,
  })

  return [
    `- \`${decision.id}\`, ${decision.decision} ${decision.at}${scope}: ${endSentence(decision.standard)}`,
    ...Array.getSomes([
      Option.map(
        decision.reason,
        (reason) => `${REASON_LABELS[decision.decision]}: ${endSentence(reason)}`
      ),
      Option.map(decision.rule, (rule) => `Proposed: \`${rule}\`.`),
      Option.liftPredicate(`Then: ${evidence.join(", ")}.`, () => evidence.length > 0),
    ]),
  ].join(" ")
}

function renderDecisionsRecord(record: DecisionsRecord, scope: HardenContext["scope"]) {
  const name = `The decisions record is \`${record.path}\`.`

  return DecisionsRecord.match(record, {
    Missing: () =>
      `${name} It does not exist yet, so no earlier session recorded a decision. Step 8 creates it with the first line.`,
    Present: ({ decisions, undecodableLines }) => {
      const folder = scope === null ? "" : ` for \`${scope}\``

      const held =
        decisions.length === 0
          ? `It holds no decision${folder}.`
          : [
              `It holds these decisions${folder}${scope === null ? "" : ", without the decisions of other folders"}. After \`Then\`, a line gives what the session of that date counted: the places that follow and break the standard, and its fix commits.`,
              "",
              ...decisions.map((decision) => renderDecision(decision)),
            ].join("\n")

      const undecodable =
        undecodableLines.length === 0
          ? []
          : [
              [
                "Adamantite could not decode these lines of the record, and left them out. Repair each one when you append to the record in step 8.",
                "",
                ...undecodableLines.map(({ issue, line }) => `- Line ${line}: ${issue}`),
              ].join("\n"),
            ]

      return [`${name} ${held}`, ...undecodable].join("\n\n")
    },
  })
}

function renderDecisionExample(today: string, scope: HardenContext["scope"]) {
  const scopeKey = scope === null ? "" : `"scope":${JSON.stringify(scope)},`

  return `{"id":"default-exports","at":"${today}","standard":"Modules have no default export","decision":"rejected","reason":"The router loads each page by its default export","rule":"import/no-default-export",${scopeKey}"follow":41,"break":7,"fixes":["1a2b3c4"]}`
}

function renderSessionLine(today: string, context: HardenContext) {
  const head = FixHistory.match(context.fixHistory, {
    Last: () => context.head,
    Requested: () => Option.none(),
    Since: () => context.head,
  }).pipe(
    Option.match({
      onNone: () => "",
      onSome: (commit) => `,"head":"${commit}"`,
    })
  )

  const scope = context.scope === null ? "" : `,"scope":${JSON.stringify(context.scope)}`

  return `{"session":"${today}"${head}${scope}}`
}

function renderFixHistory(history: FixHistory, scope: HardenContext["scope"]) {
  // `.` keeps the history to the project folder when the project is a folder of a larger
  // repository.
  const folder = quoteShellArgument(scope ?? ".")

  function command(range: string) {
    return `\`git log ${range} --no-merges --format="%h %s" -- ${folder}\``
  }

  function renderLast({ count }: { readonly count: number }) {
    return [
      "Run this command from the project root, and read the commits that it lists. When the history has fewer commits, read all of them, and say how many you read.",
      "",
      command(`-n ${count}`),
    ].join("\n")
  }

  return FixHistory.match(history, {
    Last: renderLast,
    Requested: renderLast,
    Since: ({ boundary, head, session }) =>
      [
        `A session on ${session} read the fix history of ${scope === null ? "the project" : `\`${scope}\``} up to commit \`${head}\`. Run this command from the project root, and read the commits that it lists: the commits since commit \`${boundary}\`, the common ancestor of that commit and \`HEAD\`. When it lists no commit, record that the history has no commit after that session, and continue with step 5. To read older history, the user runs \`adamantite harden --commits <number>\`.`,
        "",
        command(`${boundary}..HEAD`),
      ].join("\n"),
  })
}

export function renderHardenPrompt(
  context: HardenContext,
  adamantiteVersion: string,
  today: string
): string {
  return fillTemplate(hardenPromptTemplate, {
    agentReach: Option.match(context.agentReach, {
      onNone: () =>
        "Git could not list the files, so agent reach is unavailable. Follow the links from each `AGENTS.md` and record the files you checked. Report this fallback with the missing sources.",
      onSome: (reach) => renderAgentReach(reach),
    }),
    configs: renderList(
      context.configs,
      "No Oxlint config was found. When you show the candidates, tell the user to run `adamantite init` before step 9."
    ),
    customRulesSection: CUSTOM_RULES_SECTION,
    decisionExample: renderDecisionExample(today, context.scope),
    decisionScope:
      context.scope === null
        ? "A line of this session has no `scope`, because this session covers the whole project."
        : `A line of this session has \`"scope":${JSON.stringify(context.scope)}\`, the folder of this session.`,
    decisionsCovered:
      context.scope === null
        ? "This session covers each decision that the section shows."
        : `This session covers a decision in \`${context.scope}\` or in a folder inside it.`,
    decisionsRecord: renderDecisionsRecord(context.decisionsRecord, context.scope),
    documentationFiles: Option.match(context.documentationFiles, {
      onNone: () =>
        "Git could not list project files. Find Markdown files with a file search, excluding dependencies, build output, changesets, changelogs, and agent skill folders such as `.agents/skills`. Record the search scope and report this fallback with the missing sources.",
      onSome: (files) => renderList(files, "The project has no Markdown file."),
    }),
    fixHistory: renderFixHistory(context.fixHistory, context.scope),
    hardeningSkill: HARDENING_SKILL,
    instructionFiles: renderList(
      context.instructionFiles,
      "No `AGENTS.md` was found. Each file that states a standard is a discovery gap, and the root `AGENTS.md` must point to it."
    ),
    ladder: enforcementLadder,
    overrides: renderOverrides(context.overrides),
    rulesFolders: renderRulesFolders(context),
    scope:
      context.scope === null
        ? "Adamantite found these files in the project and its workspace packages. Paths are relative to the project root."
        : `Adamantite found these files for \`${context.scope}\`, the folder that \`--path\` selects. Survey only the code in this folder. Paths are relative to the project root.`,
    sessionLine: renderSessionLine(today, context),
    suppressions: renderSuppressions(context.suppressions),
    today,
    version: adamantiteVersion,
  })
}
