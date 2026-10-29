import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { getHardenPromptTemplate } from "#lib/hardening/harden-prompt.macro.ts" with { type: "macro" }
import { fillTemplate } from "#lib/shared/template.ts"
import { discoverCustomRules } from "#lib/workspace/custom-rules/discover.ts"
import { CUSTOM_RULES_DIRECTORY } from "#lib/workspace/custom-rules/index.ts"
import { checkIsMonorepo, getWorkspacePackageDirectories } from "#lib/workspace/monorepo.ts"

const hardenPromptTemplate = getHardenPromptTemplate()

const INSTRUCTION_FILES = ["CODING_STANDARDS.md", "AGENTS.md", "GLOSSARY.md", "docs/adr"] as const

/**
 * The files that a harden session starts from. Paths are relative to the project root.
 */
interface HardenContext {
  readonly configs: readonly string[]
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
 * when they are outside the scope.
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
  const instructionCandidates = [...new Set([cwd, ...selectedPackages])].flatMap((directory) =>
    INSTRUCTION_FILES.map((file) => path.join(directory, file))
  )
  // `forEach` keeps the order of the candidates, which `Effect.filter` loses under concurrency.
  const exists = yield* Effect.forEach(
    instructionCandidates,
    (file) => fs.exists(file).pipe(Effect.orElseSucceed(() => false)),
    { concurrency: "unbounded" }
  )

  return {
    configs: configs.map((config) => relative(config)),
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
      "No Oxlint config was found. When you show the candidates, tell the user to run `adamantite init` before step 7."
    ),
    instructionFiles: renderList(context.instructionFiles, "No instruction file was found."),
    rulesFolders: renderRulesFolders(context),
    scope:
      context.scope === null
        ? "Adamantite found these files in the project and its workspace packages. Paths are relative to the project root."
        : `Adamantite found these files for \`${context.scope}\`, the folder that \`--path\` selects. Survey only the code in this folder. Paths are relative to the project root.`,
    version: adamantiteVersion,
  })
}
