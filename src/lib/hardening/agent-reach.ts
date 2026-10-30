import { posix } from "node:path"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { pipe } from "effect/Function"
import * as Path from "effect/Path"

/**
 * The Markdown files that a coding agent can find from `AGENTS.md`. Paths are relative to the
 * project root, with `/` between folders, as git prints them.
 */
export interface AgentReach {
  /**
   * The Markdown links to Markdown files that do not exist.
   */
  readonly brokenLinks: readonly BrokenLink[]
  /**
   * The Markdown files that no chain of references from an `AGENTS.md` reaches.
   */
  readonly unreached: readonly string[]
}

export interface BrokenLink {
  readonly file: string
  readonly target: string
}

const MARKDOWN_EXTENSION = /\.(?:md|mdx|mdc)$/u
// A fence opens with three or more backticks or tildes, and the same fence or the end of the file
// closes it.
const FENCED_BLOCK = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gmu
const CODE_SPAN = /`([^`\n]+)`/gu
const INLINE_LINK = /\]\(\s*<?([^\s)>]+)>?(?:\s[^)]*)?\)/gu
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/gmu
const URL_SCHEME = /^[a-z][\d+.a-z-]*:/iu

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
 * Reads which Markdown files each `AGENTS.md` reaches. A Markdown link resolves from the folder of
 * its file, or from the root when it starts with `/`. A code span resolves from the folder of its
 * file, then from the root, because instructions often name a root path. A reference to a folder
 * reaches each Markdown file directly in it. A fenced code block holds examples, so its links and
 * paths do not count, and a link inside a code span is an example too.
 */
export const readAgentReach = Effect.fn("readAgentReach")(function* (
  cwd: string,
  files: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const listed = new Set(files)
  const prose = new Map(
    yield* Effect.forEach(
      files,
      (file) =>
        fs.readFileString(path.join(cwd, file)).pipe(
          Effect.orElseSucceed(() => ""),
          Effect.map((content) => [file, content.replaceAll(FENCED_BLOCK, "")] as const)
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
  const getLinkTargets = (file: string) => {
    const text = (prose.get(file) ?? "").replaceAll(CODE_SPAN, "")

    return [...matchAll(text, INLINE_LINK), ...matchAll(text, LINK_DEFINITION)]
      .filter((target) => !URL_SCHEME.test(target) && !target.startsWith("#"))
      .map((target) => cleanTarget(target))
      .filter((target) => target.length > 0)
      .map((target) =>
        posix.normalize(
          target.startsWith("/") ? target.slice(1) : posix.join(posix.dirname(file), target)
        )
      )
  }
  const getReferences = (file: string) => [
    ...getLinkTargets(file).flatMap((target) => resolve([target])),
    ...matchAll(prose.get(file) ?? "", CODE_SPAN).flatMap((span) =>
      resolve([posix.join(posix.dirname(file), span), span])
    ),
  ]

  const agentsFiles = files.filter((file) => posix.basename(file) === "AGENTS.md")
  const reached = new Set(agentsFiles)
  const queue = [...agentsFiles]

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

  return {
    brokenLinks,
    unreached: files.filter((file) => !reached.has(file)),
  } satisfies AgentReach
})
