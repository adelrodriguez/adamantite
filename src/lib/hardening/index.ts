import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { getHardenPromptTemplate } from "#lib/hardening/harden-prompt.macro.ts" with { type: "macro" }
import { fillTemplate } from "#lib/shared/template.ts"
import { discoverCustomRules } from "#lib/workspace/custom-rules/discover.ts"
import { CUSTOM_RULES_DIRECTORY } from "#lib/workspace/custom-rules/index.ts"

const hardenPromptTemplate = getHardenPromptTemplate()

/**
 * The instruction files that can state coding standards, and the ADR folder.
 */
const INSTRUCTION_FILES = ["CODING_STANDARDS.md", "AGENTS.md", "GLOSSARY.md", "docs/adr"] as const

/**
 * The files that a harden session starts from. Paths are relative to the project root.
 */
interface HardenContext {
  readonly configs: readonly string[]
  readonly instructionFiles: readonly string[]
  readonly rulesFolders: readonly string[]
  /**
   * Files with a `custom()` call whose `dir` is not a string literal, so only the agent can find
   * its rules folder.
   */
  readonly unresolvedCalls: readonly string[]
}

export const readHardenContext = Effect.fn("readHardenContext")(function* (cwd: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const relative = (target: string) => path.relative(cwd, target) || "."
  const { calls, configs } = yield* discoverCustomRules([cwd])
  // `forEach` keeps the order of `INSTRUCTION_FILES`, which `Effect.filter` loses under concurrency.
  const exists = yield* Effect.forEach(
    INSTRUCTION_FILES,
    (file) => fs.exists(path.join(cwd, file)).pipe(Effect.orElseSucceed(() => false)),
    { concurrency: "unbounded" }
  )
  const instructionFiles = INSTRUCTION_FILES.filter((_, index) => exists[index])

  return {
    configs: configs.map((config) => relative(config)),
    instructionFiles,
    rulesFolders: [
      ...new Set(calls.flatMap((call) => (call.dir === null ? [] : [relative(call.dir)]))),
    ],
    unresolvedCalls: [
      ...new Set(calls.flatMap((call) => (call.dir === null ? [relative(call.source)] : []))),
    ],
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
      "No Oxlint config was found. When you show the candidates, tell the user to run `adamantite init` before step 6."
    ),
    instructionFiles: renderList(context.instructionFiles, "No instruction file was found."),
    rulesFolders: renderRulesFolders(context),
    version: adamantiteVersion,
  })
}
