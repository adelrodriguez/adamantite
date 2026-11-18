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

const ASCII_PUNCTUATION = /^[!-/:-@[-`{-~]$/u
const WORD_CHARACTER = /^[\p{L}\p{N}]$/u

// An autolink, such as `<https://example.com>`, shows its address.
const AUTOLINK = /^<([a-z][\d+.a-z-]{1,31}:[^\s<>]*|[^\s<>@]+@[^\s<>]+)>/iu

// An HTML tag or comment shows no text.
const HTML_TAG = /^<(?:\/?[a-z][\da-z-]*(?:\s[^<>]*)?\/?|!--[\s\S]*?--)>/iu
const ENTITY = /^&(?:#(\d{1,7})|#x([\da-f]{1,6})|([\da-z]+));/iu

const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", "\u00A0"],
  ["quot", '"'],
])

// A named entity of a Latin letter with a diacritic, such as `&eacute;`.
const DIACRITIC_ENTITY = /^([a-z])(acute|cedil|circ|grave|ring|tilde|uml)$/iu

const DIACRITICS = new Map([
  ["acute", "\u0301"],
  ["cedil", "\u0327"],
  ["circ", "\u0302"],
  ["grave", "\u0300"],
  ["ring", "\u030A"],
  ["tilde", "\u0303"],
  ["uml", "\u0308"],
])

// GitHub keeps letters and other alphabetic characters, marks, decimal digits, connector
// punctuation such as `_`, spaces, and hyphens, as `github-slugger` does. A number such as `²` goes.
const SLUG_REMOVED = /[^\p{Alphabetic}\p{M}\p{Nd}\p{Pc} -]/gu

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
 * The end of the code span that opens with the backtick run at `start`: the index after its closing
 * run of the same length, or -1 when no such run closes it.
 */
function findCodeSpanEnd(source: string, start: number) {
  const run = /^`+/u.exec(source.slice(start))?.[0] ?? "`"
  const contentStart = start + run.length

  for (const match of source.slice(contentStart).matchAll(/`+/gu)) {
    if (match[0].length === run.length) {
      return contentStart + match.index + run.length
    }
  }

  return -1
}

/**
 * The index of the `]` that closes the bracket at `start`, or -1. A code span binds before a link,
 * so a `]` inside a code span does not close it.
 */
function findLabelEnd(source: string, start: number) {
  let depth = 0

  for (let index = start; index < source.length; index += 1) {
    const character = source[index]

    if (character === "\\") {
      index += 1
    } else if (character === "`") {
      const end = findCodeSpanEnd(source, index)

      if (end !== -1) {
        index = end - 1
      }
    } else if (character === "[") {
      depth += 1
    } else if (character === "]") {
      depth -= 1

      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

/**
 * The index after the `)` that closes the destination and title of an inline link, whose `(` is at
 * `start`, or -1.
 */
function findDestinationEnd(source: string, start: number) {
  let depth = 0

  for (let index = start; index < source.length; index += 1) {
    const character = source[index]

    if (character === "\\") {
      index += 1
    } else if (character === "<" || character === '"' || character === "'") {
      const close = source.indexOf(character === "<" ? ">" : character, index + 1)

      if (close === -1) {
        return -1
      }

      index = close
    } else if (character === "(") {
      depth += 1
    } else if (character === ")") {
      depth -= 1

      if (depth === 0) {
        return index + 1
      }
    }
  }

  return -1
}

/**
 * The character of a numeric entity. CommonMark shows U+FFFD for a code point that Unicode does not
 * have, such as `&#0;` or `&#9999999;`.
 */
function toCharacter(codePoint: number) {
  return codePoint > 0 && codePoint <= 0x10_ff_ff ? String.fromCodePoint(codePoint) : "\uFFFD"
}

/**
 * The text of an entity, or the texts that it can show when the scanner does not know it: none, as
 * for a symbol, or its name, as when it is not an entity.
 */
function readEntity([text, decimal, hex, name = ""]: RegExpExecArray): readonly string[] {
  if (decimal !== undefined) {
    return [toCharacter(Number.parseInt(decimal, 10))]
  }

  if (hex !== undefined) {
    return [toCharacter(Number.parseInt(hex, 16))]
  }

  const known = NAMED_ENTITIES.get(name)
  const [, letter, mark = ""] = DIACRITIC_ENTITY.exec(name) ?? []

  if (known !== undefined) {
    return [known]
  }

  return letter === undefined
    ? ["", text]
    : [`${letter}${DIACRITICS.get(mark) ?? ""}`.normalize("NFC")]
}

/**
 * The text that a heading renders, as a list of pieces, each with the texts that it can show. One
 * pass reads the inline constructs in the order that CommonMark gives them precedence: an escape,
 * then a code span, an autolink, an HTML tag, and an entity, then a link or an image, whose text
 * the pass reads again and whose destination shows no text. An underscore run that is not inside a
 * word opens or closes emphasis and shows nothing, when the runs pair up.
 *
 * A false dead anchor fails a harden session, so a construct that the pass cannot settle gives each
 * text that it can show: a reference link, whose definition decides whether it is a link, an
 * unknown entity, and underscore runs that do not pair up.
 */
function scanInline(source: string): ReadonlyArray<readonly string[]> {
  const pieces: Array<readonly string[]> = []
  const underscoreRuns: number[] = []
  let text = ""

  const flush = () => {
    if (text.length > 0) {
      pieces.push([text])
      text = ""
    }
  }

  for (let index = 0; index < source.length;) {
    const character = source[index] ?? ""
    const rest = source.slice(index)

    if (character === "\\" && ASCII_PUNCTUATION.test(source[index + 1] ?? "")) {
      text += source[index + 1]
      index += 2
      continue
    }

    if (character === "`") {
      const run = /^`+/u.exec(rest)?.[0] ?? "`"
      const end = findCodeSpanEnd(source, index)

      if (end === -1) {
        text += run
        index += run.length
        continue
      }

      const code = source.slice(index + run.length, end - run.length)
      const padded = code.startsWith(" ") && code.endsWith(" ") && code.trim() !== ""
      text += padded ? code.slice(1, -1) : code
      index = end
      continue
    }

    const autolink = AUTOLINK.exec(rest)
    const tag = HTML_TAG.exec(rest)
    const entity = ENTITY.exec(rest)

    if (autolink !== null) {
      text += autolink[1]
      index += autolink[0].length
      continue
    }

    if (tag !== null) {
      index += tag[0].length
      continue
    }

    if (entity !== null) {
      flush()
      pieces.push(readEntity(entity))
      index += entity[0].length
      continue
    }

    const isImage = character === "!" && source[index + 1] === "["
    const labelStart = isImage ? index + 1 : index
    const labelEnd = character === "[" || isImage ? findLabelEnd(source, labelStart) : -1

    if (labelEnd !== -1) {
      const label = scanInline(source.slice(labelStart + 1, labelEnd))

      const destinationEnd =
        source[labelEnd + 1] === "(" ? findDestinationEnd(source, labelEnd + 1) : -1

      const referenceEnd = source[labelEnd + 1] === "[" ? findLabelEnd(source, labelEnd + 1) : -1

      flush()

      if (destinationEnd !== -1) {
        // An image shows no text in the heading, and a link shows its text.
        pieces.push(...(isImage ? [] : label))
        index = destinationEnd
        continue
      }

      pieces.push(...label)

      if (referenceEnd !== -1) {
        // Without its definition, a reference link shows its brackets and the reference as text.
        pieces.push(["", source.slice(labelEnd + 2, referenceEnd)])
        index = referenceEnd + 1
        continue
      }

      index = labelEnd + 1
      continue
    }

    if (character === "_") {
      const run = /^_+/u.exec(rest)?.[0] ?? "_"
      const before = source[index - 1] ?? ""
      const after = source[index + run.length] ?? ""

      if (!(WORD_CHARACTER.test(before) && WORD_CHARACTER.test(after))) {
        flush()
        underscoreRuns.push(pieces.length)
        pieces.push([run])
        index += run.length
        continue
      }
    }

    text += character
    index += 1
  }

  flush()

  for (const position of underscoreRuns) {
    const [run = ""] = pieces[position] ?? []
    pieces[position] = underscoreRuns.length % 2 === 0 ? [""] : ["", run]
  }

  return pieces
}

/**
 * Each text that a heading can render. The first text is the one that the scanner reads as most
 * likely, and the others come from the constructs that it cannot settle.
 */
function readHeadingTexts(heading: string) {
  return scanInline(heading).reduce<readonly string[]>(
    (texts, piece) => texts.flatMap((text) => piece.map((option) => `${text}${option}`)),
    [""]
  )
}

/**
 * The anchor that GitHub makes from the text of a heading, before the suffix of a repeated heading.
 */
function toSlug(text: string) {
  return text.toLowerCase().replaceAll(SLUG_REMOVED, "").replaceAll(" ", "-")
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

    const texts = readHeadingTexts(heading)

    // GitHub keeps the id in the text of the heading, and a docs site makes the id the anchor.
    const alternatives =
      id === undefined ? texts : [...texts, ...readHeadingTexts(heading.replace(HEADING_ID, ""))]

    if (id !== undefined) {
      anchors.add(id.toLowerCase())
    }

    // A false dead anchor fails a session, so each text that the heading can render, with and
    // without the space that a construct with no text leaves at an end, gives an anchor.
    const slug = toSlug(texts[0] ?? "")

    let anchor = slug

    while (occurrences.has(anchor)) {
      const count = (occurrences.get(slug) ?? 0) + 1
      occurrences.set(slug, count)
      anchor = `${slug}-${count}`
    }

    occurrences.set(anchor, 0)
    anchors.add(anchor)

    const suffix = anchor.slice(slug.length)

    for (const text of alternatives) {
      for (const candidate of new Set([toSlug(text), toSlug(text.trim())])) {
        anchors.add(`${candidate}${suffix}`)
      }
    }
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
          // GitHub makes lower-case anchors. Whether it also finds a heading for a link in another
          // case is not confirmed, so such a link passes, and a session never fails on it.
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
