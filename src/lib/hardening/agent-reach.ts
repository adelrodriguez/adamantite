import { posix } from "node:path"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { pipe } from "effect/Function"
import * as Path from "effect/Path"

/**
 * The Markdown files that a coding agent can find from the instruction files that it loads by
 * itself. Paths are relative to the project root, with `/` between folders, as git prints them.
 */
export interface AgentReach {
  /**
   * The agent instruction files: the files that a coding agent loads at the start of a session.
   */
  readonly agentFiles: readonly string[]
  /**
   * The Markdown links to Markdown files that do not exist.
   */
  readonly brokenLinks: readonly BrokenLink[]
  /**
   * Each `AGENTS.md` that Claude Code does not read, because a `CLAUDE.md` in its folder or above
   * it counts as the project instructions and does not import it.
   */
  readonly hiddenAgentsFiles: readonly HiddenAgentsFile[]
  /**
   * The Markdown files that no chain of references from an agent instruction file reaches.
   */
  readonly unreached: readonly string[]
}

export interface BrokenLink {
  readonly file: string
  readonly target: string
}

export interface HiddenAgentsFile {
  readonly agents: string
  readonly claude: string
}

const MARKDOWN_EXTENSION = /\.(?:md|mdx|mdc)$/u
const INLINE_LINK = /\]\(\s*<?([^\s)>]+)>?(?:\s[^)]*)?\)/gu
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/gmu
const IMPORT = /(?:^|\s)@([^\s`]+)/gmu
const CODE_SPAN = /`([^`\s]+)`/gu
const URL_SCHEME = /^[a-z][\d+.a-z-]*:/iu

/**
 * Codex and other agents load each `AGENTS.md`, Claude Code loads `CLAUDE.md` and `.claude/rules`,
 * Cursor loads `.cursor/rules`, and GitHub Copilot loads its instruction files.
 */
function isAgentFile(file: string) {
  const name = posix.basename(file)

  return (
    name === "AGENTS.md"
    || name === "CLAUDE.md"
    || file.startsWith(".claude/rules/")
    || file.startsWith(".cursor/rules/")
    || file === ".github/copilot-instructions.md"
    || file.startsWith(".github/instructions/")
  )
}

function isClaudeFile(file: string) {
  return posix.basename(file) === "CLAUDE.md"
}

/**
 * The folder that holds the file, where `.claude/CLAUDE.md` belongs to the folder above `.claude`.
 */
function getInstructionFolder(file: string) {
  const folder = posix.dirname(file)

  return posix.basename(folder) === ".claude" ? posix.dirname(folder) : folder
}

function isInFolder(folder: string, file: string) {
  return folder === "." || file === folder || file.startsWith(`${folder}/`)
}

function cleanTarget(target: string) {
  const [path = ""] = target.split(/[#?]/u)

  try {
    return decodeURI(path)
  } catch {
    return path
  }
}

function matchAll(content: string, pattern: RegExp) {
  return [...content.matchAll(pattern)].map((match) => match[1] ?? "")
}

/**
 * Reads which Markdown files the agent instruction files reach. A Markdown link resolves from the
 * folder of its file, or from the root when it starts with `/`. An `@` import resolves from the
 * folder of its file, as Claude Code imports. A code span resolves from the folder of its file,
 * then from the root, because instructions often name a root path. A reference to a folder reaches
 * each Markdown file directly in it.
 */
export const readAgentReach = Effect.fn("readAgentReach")(function* (
  cwd: string,
  files: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const listed = new Set(files)
  const contents = new Map(
    yield* Effect.forEach(
      files,
      (file) =>
        fs.readFileString(path.join(cwd, file)).pipe(
          Effect.orElseSucceed(() => ""),
          Effect.map((content) => [file, content] as const)
        ),
      { concurrency: "unbounded" }
    )
  )
  const resolve = (candidates: readonly string[]) => {
    const normalized = candidates
      .map((candidate) => posix.normalize(candidate))
      .filter((candidate) => candidate !== "." && !candidate.startsWith(".."))
    const file = normalized.find((candidate) => listed.has(candidate))

    if (file !== undefined) {
      return [file]
    }

    // A folder of code, such as `src/lib`, is not a pointer to the docs below it, so only the
    // Markdown files directly in the folder count.
    const folder = normalized.find((candidate) =>
      files.some((listedFile) => posix.dirname(listedFile) === candidate)
    )

    return folder === undefined
      ? []
      : files.filter((listedFile) => posix.dirname(listedFile) === folder)
  }
  const getLinkTargets = (file: string) =>
    [
      ...matchAll(contents.get(file) ?? "", INLINE_LINK),
      ...matchAll(contents.get(file) ?? "", LINK_DEFINITION),
    ]
      .filter((target) => !URL_SCHEME.test(target) && !target.startsWith("#"))
      .map((target) => cleanTarget(target))
      .filter((target) => target.length > 0)
      .map((target) =>
        target.startsWith("/") ? target.slice(1) : posix.join(posix.dirname(file), target)
      )
  const getImports = (file: string) =>
    matchAll(contents.get(file) ?? "", IMPORT).map((target) =>
      posix.join(posix.dirname(file), cleanTarget(target))
    )
  const getReferences = (file: string) => [
    ...getLinkTargets(file).flatMap((target) => resolve([target])),
    ...getImports(file).flatMap((target) => resolve([target])),
    ...matchAll(contents.get(file) ?? "", CODE_SPAN).flatMap((span) =>
      resolve([posix.join(posix.dirname(file), span), span])
    ),
  ]

  const agentFiles = files.filter((file) => isAgentFile(file))
  const reached = new Set(agentFiles)
  const queue = [...agentFiles]

  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    for (const reference of getReferences(file)) {
      if (!reached.has(reference)) {
        reached.add(reference)
        queue.push(reference)
      }
    }
  }

  const linksToMarkdown = files.flatMap((file) =>
    getLinkTargets(file)
      .map((target) => posix.normalize(target))
      .filter((target) => MARKDOWN_EXTENSION.test(target) && !listed.has(target))
      .map((target) => ({ file, target }))
  )
  const brokenLinks = yield* pipe(
    linksToMarkdown,
    // A Markdown file that git ignores still exists.
    Effect.filter((link) =>
      fs.exists(path.join(cwd, link.target)).pipe(
        Effect.map((exists) => !exists),
        Effect.orElseSucceed(() => true)
      )
    )
  )

  const claudeFiles = files.filter((file) => isClaudeFile(file))
  const hiddenAgentsFiles = files
    .filter((file) => posix.basename(file) === "AGENTS.md")
    .flatMap((agents) => {
      const folder = posix.dirname(agents)
      // Any CLAUDE.md in the folder of the AGENTS.md or above it stops Claude Code from reading it.
      const claude = claudeFiles.find((file) => isInFolder(getInstructionFolder(file), folder))
      // Claude Code reads the AGENTS.md that a CLAUDE.md imports, or that it links to as a symlink.
      const isRead = claudeFiles.some(
        (file) =>
          getImports(file).some((target) => posix.normalize(target) === agents)
          || contents.get(file) === contents.get(agents)
      )

      return claude === undefined || isRead ? [] : [{ agents, claude }]
    })

  return {
    agentFiles,
    brokenLinks,
    hiddenAgentsFiles,
    unreached: files.filter((file) => !reached.has(file)),
  } satisfies AgentReach
})
