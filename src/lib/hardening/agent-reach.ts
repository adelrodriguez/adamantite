import * as NodePath from "@effect/platform-node/NodePath"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { readFileIfFile } from "#lib/shared/filesystem.ts"

/**
 * The Markdown files that a coding agent can find from `AGENTS.md`. Paths are relative to the
 * project root, with `/` between folders, as git prints them.
 */
export const BrokenLink = Schema.Struct({ file: Schema.String, target: Schema.String })

export type BrokenLink = typeof BrokenLink.Type

/**
 * A Markdown link to a heading that its Markdown file does not have. `target` is the file of the
 * heading, and is `file` for a link such as `#tests`.
 */
export const DeadAnchor = Schema.Struct({
  anchor: Schema.String,
  file: Schema.String,
  target: Schema.String,
})

export type DeadAnchor = typeof DeadAnchor.Type

export const AgentReach = Schema.Struct({
  /**
   * The Markdown links to Markdown files that do not exist.
   */
  brokenLinks: Schema.Array(BrokenLink),
  /**
   * The Markdown links to a heading that a Markdown file of the project does not have.
   */
  deadAnchors: Schema.Array(DeadAnchor),
  /**
   * The Markdown files that no chain of references from an `AGENTS.md` reaches.
   */
  unreached: Schema.Array(Schema.String),
})

export type AgentReach = typeof AgentReach.Type

const MARKDOWN_EXTENSION = /\.(?:md|mdx|mdc)$/u

// A fence opens with three or more backticks or tildes. A fence of the same character that is at
// least as long, with only spaces or tabs after it, closes it, as CommonMark says. The end of the
// file also closes it.
const FENCED_BLOCK = /^ {0,3}((`|~)\2{2,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1\2*[\t ]*$|(?![\s\S]))/gmu
const FRONT_MATTER = /^---\n[\s\S]*?\n---[\t ]*(?:\n|(?![\s\S]))/u
const CODE_SPAN = /`([^`\n]+)`/gu
const INLINE_LINK = /\]\(\s*<?([^\s)>]+)>?(?:\s[^)]*)?\)/gu
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/gmu
const URL_SCHEME = /^[a-z][\d+.a-z-]*:/iu

// An ATX heading, such as `## Tests`, or a setext heading: a line of text above a line of `=` or `-`.
const HEADING =
  /^ {0,3}#{1,6}(?:[\t ]+(.*?))?(?:[\t ]+#+)?[\t ]*$|^ {0,3}(\S.*)\n {0,3}(?:=+|-+)[\t ]*$/gmu

// An id that a docs site reads from the end of a heading, such as `## Tests {#tests}`.
const HEADING_ID = /\s*\{#([^\s}]+)\}\s*$/u
const HTML_ID = /<[a-z][^>]*\s(?:id|name)=["']([^"']+)["']/giu
const LINK_TEXT = /!?\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/gu
const HTML_TAG = /<\/?[a-z][^>]*>/giu

// An underscore that opens or closes emphasis, and not one inside a name such as `snake_case`.
const EMPHASIS_UNDERSCORE = /(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu

// GitHub keeps letters, marks, numbers, connector punctuation, spaces, and hyphens.
const SLUG_REMOVED = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu

// An anchor that every page has: the top of the page, or a line of the source view.
const BUILT_IN_ANCHOR = /^(?:top|L\d+(?:-L\d+)?)$/iu

function decode(text: string, decoder: (text: string) => string) {
  try {
    return decoder(text)
  } catch {
    return text
  }
}

function splitTarget(target: string) {
  const [path = "", ...rest] = target.split("#")

  return {
    anchor: rest.length === 0 ? Option.none<string>() : Option.some(rest.join("#")),
    path: decode(path.split("?")[0] ?? "", decodeURI),
  }
}

function matchAll(content: string, pattern: RegExp) {
  return [...content.matchAll(pattern)].map((match) => match[1] ?? "")
}

/**
 * The anchors of the headings of a Markdown file, as GitHub makes them: the text in lower case,
 * without punctuation, with a hyphen for each space, and `-1`, `-2`, and so on for a heading that
 * repeats. An explicit id, such as `{#tests}` or an HTML `id`, is an anchor too.
 */
function readAnchors(prose: string) {
  const anchors = new Set<string>()
  const occurrences = new Map<string, number>()

  for (const match of prose.matchAll(HEADING)) {
    const heading = (match[1] ?? match[2] ?? "").trim()
    const id = HEADING_ID.exec(heading)?.[1]

    if (id !== undefined) {
      anchors.add(id.toLowerCase())
    }

    const slug = heading
      .replace(HEADING_ID, "")
      .replaceAll(LINK_TEXT, "$1")
      .replaceAll(HTML_TAG, "")
      .replaceAll(EMPHASIS_UNDERSCORE, "")
      .trim()
      .toLowerCase()
      .replaceAll(SLUG_REMOVED, "")
      .replaceAll(" ", "-")

    let anchor = slug

    while (occurrences.has(anchor)) {
      const count = (occurrences.get(slug) ?? 0) + 1
      occurrences.set(slug, count)
      anchor = `${slug}-${count}`
    }

    occurrences.set(anchor, 0)
    anchors.add(anchor)
  }

  for (const id of matchAll(prose, HTML_ID)) {
    anchors.add(id.toLowerCase())
  }

  return anchors
}

/**
 * Reads which Markdown files the given `AGENTS.md` files reach, and the references of the
 * documentation that point to nothing. A Markdown link resolves from the folder of its file, or
 * from the root when it starts with `/`. A code span resolves from the folder of its file, then
 * from the root, because instructions often name a root path. A reference to a folder reaches each
 * Markdown file directly in it. A fenced code block holds examples, so its links and paths do not
 * count, and a link inside a code span is an example too.
 *
 * A link with an anchor to a Markdown file that git lists must name a heading of that file. Harden
 * does not check the paths that code spans name: docs name example paths, the paths of a target
 * project, and files that a plan creates, so most such paths that do not exist are not mistakes.
 */
export const readAgentReach = Effect.fn("readAgentReach")(function* (
  cwd: string,
  files: readonly string[],
  agentsFiles: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  // Git prints the paths with `/` between folders on every platform.
  const posix = yield* Path.Path.pipe(Effect.provide(NodePath.layerPosix))
  const listed = new Set(files)

  const prose = new Map(
    yield* Effect.forEach(
      files,
      (file) =>
        // Git can list a file that a delete or a sparse checkout left out of the working tree.
        readFileIfFile(path.join(cwd, file)).pipe(
          Effect.map(
            (content) =>
              [
                file,
                Option.getOrElse(content, () => "")
                  .replaceAll("\r\n", "\n")
                  .replace(FRONT_MATTER, "")
                  .replaceAll(FENCED_BLOCK, ""),
              ] as const
          )
        ),
      { concurrency: "unbounded" }
    )
  )

  const resolve = (candidates: readonly string[]) => {
    const normalized = candidates.flatMap((candidate) => {
      const normalizedCandidate = posix.normalize(candidate)

      return normalizedCandidate !== "." && !normalizedCandidate.startsWith("..")
        ? [normalizedCandidate]
        : []
    })

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

  /**
   * The links of `file` to a file of the project, with the anchor of each. A link to a heading of
   * `file` itself, such as `#tests`, has `file` as its target.
   */
  const getLinks = (file: string) => {
    const text = (prose.get(file) ?? "").replaceAll(CODE_SPAN, "")

    return [...matchAll(text, INLINE_LINK), ...matchAll(text, LINK_DEFINITION)].flatMap((link) => {
      if (URL_SCHEME.test(link)) {
        return []
      }

      const { anchor, path: target } = splitTarget(link)

      if (target.length === 0) {
        return link.startsWith("#") ? [{ anchor, target: file }] : []
      }

      return [
        {
          anchor,
          target: posix.normalize(
            target.startsWith("/") ? target.slice(1) : posix.join(posix.dirname(file), target)
          ),
        },
      ]
    })
  }

  const getLinkTargets = (file: string) =>
    getLinks(file).flatMap((link) => (link.target === file ? [] : [link.target]))

  const getCodeSpans = (file: string) => matchAll(prose.get(file) ?? "", CODE_SPAN)

  const getReferences = (file: string) => [
    ...getLinkTargets(file).flatMap((target) => resolve([target])),
    ...getCodeSpans(file).flatMap((span) => resolve([posix.join(posix.dirname(file), span), span])),
  ]

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

  const isMissing = (target: string) =>
    fs.exists(path.join(cwd, target)).pipe(
      Effect.map((exists) => !exists),
      Effect.orElseSucceed(() => true)
    )

  // A Markdown file that git ignores still exists.
  const brokenLinks = yield* Effect.filter(linksToMarkdown, (link) => isMissing(link.target), {
    concurrency: "unbounded",
  })

  const anchors = new Map(files.map((file) => [file, readAnchors(prose.get(file) ?? "")]))

  // Only the headings of a Markdown file that git lists are known, so a link to another file
  // keeps its anchor unchecked.
  const deadAnchors = files.flatMap((file) =>
    getLinks(file).flatMap(({ anchor, target }) => {
      const known = anchors.get(target)

      return Option.match(anchor, {
        onNone: () => [],
        onSome: (name) => {
          const decoded = decode(name, decodeURIComponent).toLowerCase()

          return known === undefined
            || decoded.length === 0
            || BUILT_IN_ANCHOR.test(decoded)
            || known.has(decoded)
            ? []
            : [{ anchor: name, file, target }]
        },
      })
    })
  )

  return {
    brokenLinks,
    deadAnchors,
    unreached: files.filter((file) => !reached.has(file)),
  } satisfies AgentReach
})
