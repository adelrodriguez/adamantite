import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Stream from "effect/Stream"
import * as String from "effect/String"
import { getHardenPromptTemplate } from "#lib/hardening/harden-prompt.macro.ts" with { type: "macro" }
import { fillTemplate } from "#lib/shared/template.ts"
import { discoverCustomRules } from "#lib/workspace/custom-rules/discover.ts"
import { CUSTOM_RULES_DIRECTORY } from "#lib/workspace/custom-rules/index.ts"
import { checkIsMonorepo, getWorkspacePackageDirectories } from "#lib/workspace/monorepo.ts"

const hardenPromptTemplate = getHardenPromptTemplate()

/**
 * Each coding agent starts from `AGENTS.md`, and `AGENTS.md` points to the other documentation.
 * Harden does not read the instruction files of one vendor, such as `CLAUDE.md`, as instructions.
 */
const AGENTS_FILE = "AGENTS.md"

/**
 * The Markdown files below `cwd` that git tracks, and the new files that git does not ignore, as
 * paths relative to `cwd`. Some tracked files can be missing from the working tree. None when git
 * cannot list them, for example outside a repository.
 */
const listMarkdownFiles = Effect.fn("listMarkdownFiles")(
  function* (cwd: string) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const handle = yield* spawner.spawn(
      ChildProcess.make(
        "git",
        [
          "ls-files",
          "-z",
          "--cached",
          "--others",
          "--exclude-standard",
          "--",
          "*.md",
          "*.mdx",
          "*.mdc",
        ],
        { cwd, stderr: "ignore", stdin: "ignore" }
      )
    )
    const [output, exitCode] = yield* Effect.all(
      [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
      { concurrency: "unbounded" }
    )

    const files = pipe(
      output,
      String.split("\0"),
      Array.filter((file) => String.isNonEmpty(file))
    )

    // Git prints nothing to stdout when it fails, so only the exit code tells an error apart.
    return Option.liftPredicate(files, () => exitCode === 0)
  },
  Effect.scoped,
  Effect.orElseSucceed(() => Option.none<string[]>())
)

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
  const packageDirectories = [
    cwd,
    ...((yield* checkIsMonorepo(cwd)) ? yield* getWorkspacePackageDirectories(cwd) : []),
  ]
  const packagesInScope = packageDirectories.filter((directory) => contains(scope, directory))
  // The innermost package that contains the scope, when the scope holds no package of its own.
  const owner = Array.sort(
    packageDirectories.filter((directory) => contains(directory, scope)),
    Order.mapInput(Order.flip(Order.Number), (directory: string) => directory.length)
  ).slice(0, 1)
  const selectedPackages = packagesInScope.length > 0 ? packagesInScope : owner
  const { calls, configs, unresolvedCalls } = yield* discoverCustomRules(
    packageDirectories,
    selectedPackages
  )
  // The root instructions apply to every package, so a scope keeps them.
  const instructionCandidates = [...new Set([cwd, ...selectedPackages])].map((directory) =>
    path.join(directory, AGENTS_FILE)
  )
  // `forEach` keeps the order of the candidates, which `Effect.filter` loses under concurrency.
  const exists = yield* Effect.forEach(
    instructionCandidates,
    (file) => fs.exists(file).pipe(Effect.orElseSucceed(() => false)),
    { concurrency: "unbounded" }
  )

  // The innermost package that contains the file owns it.
  const isSelected = (file: string) => {
    const [innermost = cwd] = Array.sort(
      packageDirectories.filter((directory) => contains(directory, file)),
      Order.mapInput(Order.flip(Order.Number), (directory: string) => directory.length)
    )

    return innermost === cwd || selectedPackages.includes(innermost)
  }
  const markdownFiles = yield* listMarkdownFiles(cwd)
  // The git index also has the files that a delete or a sparse checkout left out of the working
  // tree, and the agent cannot read those.
  const documentationFiles = yield* Effect.transposeOption(
    markdownFiles.pipe(
      Option.map((files) =>
        Effect.forEach(
          files.filter((file) => isDocumentation(file) && isSelected(path.join(cwd, file))),
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

  return {
    configs: configs.map((config) => relative(config)),
    documentationFiles,
    instructionFiles: instructionCandidates
      .filter((_, index) => exists[index])
      .map((file) => relative(file)),
    rulesFolders: [...new Set(calls.map((call) => relative(call.dir)))],
    scope: scope === cwd ? null : relative(scope),
    unresolvedCalls: [...new Set(unresolvedCalls.map((source) => relative(source)))],
  } satisfies HardenContext
})

function renderList(paths: readonly string[], empty: string) {
  return paths.length === 0 ? empty : paths.map((file) => `- \`${file}\``).join("\n")
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
 * The Markdown prompt that a coding agent follows to harden the project. Code renders only the
 * detected files; `harden-prompt.md` holds the rest.
 */
export function renderHardenPrompt(context: HardenContext, adamantiteVersion: string): string {
  return fillTemplate(hardenPromptTemplate, {
    configs: renderList(
      context.configs,
      "No Oxlint config was found. When you show the candidates, tell the user to run `adamantite init` before step 8."
    ),
    documentationFiles: Option.match(context.documentationFiles, {
      onNone: () =>
        "Git could not list the files of this project. Find the Markdown files with a file search, and leave out the dependencies, the build output, the changesets, and the changelogs.",
      onSome: (files) => renderList(files, "The project has no Markdown file."),
    }),
    instructionFiles: renderList(
      context.instructionFiles,
      "No `AGENTS.md` was found. Each file that states a standard is a discovery gap, and the root `AGENTS.md` must point to it."
    ),
    rulesFolders: renderRulesFolders(context),
    scope:
      context.scope === null
        ? "Adamantite found these files in the project and its workspace packages. Paths are relative to the project root."
        : `Adamantite found these files for \`${context.scope}\`, the folder that \`--path\` selects. Survey only the code in this folder. Paths are relative to the project root.`,
    version: adamantiteVersion,
  })
}
