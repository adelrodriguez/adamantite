import { existsSync, globSync, readFileSync } from "node:fs"
import { dirname, join, sep } from "node:path"
import { describe, expect, it } from "@effect/vitest"

const REPO_ROOT = join(import.meta.dirname, "../..")

/**
 * The docs that describe this repository to a contributor. A code span in them that starts with a
 * source folder names a file or a folder of the repository.
 */
const CONTRIBUTOR_DOCS = [
  "AGENTS.md",
  "CODING_STANDARDS.md",
  "CONTRIBUTING.md",
  "DESIGN.md",
  "GLOSSARY.md",
  "docs/**/*.md",
]

/**
 * The docs that describe a target project to a user. A path in a code span of them, such as
 * `src/components/ui`, is a path of the target project, so only their links are checked.
 */
const USER_DOCS = ["README.md", "skills/**/*.md"]

const SOURCE_FOLDERS = ["src/", "presets/", "scripts/", "config/", "docs/", "skills/"]

/**
 * The lines of a Markdown file outside its fenced code blocks, each with its line number.
 */
function readProse(file: string) {
  let fenced = false

  return readFileSync(join(REPO_ROOT, file), "utf8")
    .split("\n")
    .flatMap((text, index) => {
      if (/^\s*(?:```|~~~)/u.test(text)) {
        fenced = !fenced

        return []
      }

      return fenced ? [] : [{ line: index + 1, text }]
    })
}

function listDocs(patterns: readonly string[]) {
  return globSync(patterns, { cwd: REPO_ROOT }).map((file) => file.split(sep).join("/"))
}

/**
 * The anchor that GitHub gives a heading: the text in lower case, without the link targets and the
 * punctuation, with a hyphen for each space.
 */
function slugHeading(heading: string) {
  return heading
    .trim()
    .replaceAll(/\]\([^)]*\)/gu, "")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replaceAll(" ", "-")
}

/**
 * The anchors of a Markdown file. GitHub adds `-1`, `-2`, and so on to a heading that repeats an
 * earlier one.
 */
function listAnchors(file: string) {
  const seen = new Map<string, number>()

  return readProse(file).flatMap(({ text }) => {
    const heading = /^#{1,6} +(.+?)(?: +#+)?$/u.exec(text)?.[1]

    if (heading === undefined) {
      return []
    }

    const slug = slugHeading(heading)
    const count = seen.get(slug) ?? 0
    seen.set(slug, count + 1)

    return [count === 0 ? slug : `${slug}-${count}`]
  })
}

/**
 * The reason that a link target of a doc is dead, or nothing for a target that exists, such as
 * `docs/architecture.md#layers` from the root. A target with a scheme, such as `https:`, is not a
 * file of the repository.
 */
function findDeadLink(file: string, target: string): string[] {
  if (/^[a-z][\w+.-]*:/iu.test(target)) {
    return []
  }

  const [path = "", anchor] = target.split("#")
  const linked = path === "" ? file : join(dirname(file), path).split(sep).join("/")

  if (!existsSync(join(REPO_ROOT, linked))) {
    return [`links to ${target}, and ${linked} does not exist`]
  }

  return anchor === undefined || !linked.endsWith(".md") || listAnchors(linked).includes(anchor)
    ? []
    : [`links to ${target}, and ${linked} has no heading with the anchor #${anchor}`]
}

/**
 * The dead links of the docs, each with its file and its line.
 */
function listDeadLinks() {
  return listDocs([...CONTRIBUTOR_DOCS, ...USER_DOCS]).flatMap((file) =>
    readProse(file).flatMap(({ line, text }) =>
      [...text.matchAll(/\]\(([^)\s]+)\)/gu)].flatMap(([, target = ""]) =>
        findDeadLink(file, target).map((reason) => `${file}:${line} ${reason}`)
      )
    )
  )
}

/**
 * Whether a code span names a path of the repository that does not exist. A path of the repository
 * starts with a source folder, and has no glob or placeholder character, as `src/<preset>/` has.
 */
function isDeadPath(span: string) {
  return (
    SOURCE_FOLDERS.some((folder) => span.startsWith(folder))
    && !/[*<{]/u.test(span)
    && !existsSync(join(REPO_ROOT, span))
  )
}

/**
 * The code spans of the contributor docs that name a dead path, each with its file and its line.
 */
function listDeadPaths() {
  return listDocs(CONTRIBUTOR_DOCS).flatMap((file) =>
    readProse(file).flatMap(({ line, text }) =>
      [...text.matchAll(/`([^`]+)`/gu)].flatMap(([, span = ""]) =>
        isDeadPath(span) ? [`${file}:${line} names \`${span}\`, which does not exist`] : []
      )
    )
  )
}

describe("the docs of the repository", () => {
  it("link only to files and headings that exist", () => {
    expect(listDeadLinks()).toStrictEqual([])
  })

  it("name only source paths that exist in the code spans of the contributor docs", () => {
    expect(listDeadPaths()).toStrictEqual([])
  })
})
