import { parseSync, type ParserOptions } from "oxc-parser"

/**
 * Source files and component files whose embedded scripts Oxlint lints.
 */
export const SOURCE_FILE = /(?:\.[cm]?[jt]sx?|\.(?:vue|svelte|astro))$/u

/**
 * A comment that turns rules off. Oxlint obeys the `eslint-disable` comments too. The rule names
 * come after the directive, and a reason can follow ` -- `.
 */
const DISABLE_DIRECTIVE =
  /^\s*(?:oxlint|eslint)-disable(?:-next-line|-line)?(?:\s(?<rules>[\s\S]*))?$/u

const REASON = /\s--[\s\S]*$/u

/**
 * The disable comments in a source file, as the rules that each one names, with its line. A file
 * that does not parse has none.
 */
export function findSuppressions(
  file: string,
  content: string
): Array<{ readonly line: number; readonly rules: readonly string[] }> {
  const scripts: Array<{
    readonly offset: number
    readonly options: ParserOptions
    readonly source: string
  }> = []

  if (/\.(?:vue|svelte|astro)$/u.test(file)) {
    const frontmatter = file.endsWith(".astro")
      ? /^---[^\S\r\n]*\r?\n(?<script>[\s\S]*?)^---[^\S\r\n]*(?:\r?\n|$)/mu.exec(content)
      : null

    if (frontmatter !== null) {
      scripts.push({
        offset: frontmatter[0].indexOf("\n") + 1,
        options: { lang: "ts" },
        source: frontmatter.groups?.["script"] ?? "",
      })
    }

    for (const match of content.matchAll(
      /<script\b(?<attributes>[^>]*)>(?<script>[\s\S]*?)<\/script\s*>/giu
    )) {
      // A string in Astro frontmatter can contain an HTML script tag.
      if (match.index >= (frontmatter?.[0].length ?? 0)) {
        const language = /\blang\s*=\s*["'](?<language>[^"']+)["']/iu
          .exec(match.groups?.["attributes"] ?? "")
          ?.groups?.["language"]?.toLowerCase()

        scripts.push({
          offset: match.index + match[0].indexOf(">") + 1,
          options: { lang: language === "tsx" || language === "jsx" ? language : "ts" },
          source: match.groups?.["script"] ?? "",
        })
      }
    }
  } else {
    scripts.push({ offset: 0, options: {}, source: content })
  }

  return scripts.flatMap(({ offset, options, source }) => {
    const { comments, errors } = parseSync(file, source, options)

    if (errors.length > 0) {
      return []
    }

    return comments.flatMap((comment) => {
      const match = DISABLE_DIRECTIVE.exec(comment.value)

      if (match === null) {
        return []
      }

      const rules = (match.groups?.["rules"] ?? "")
        .replace(REASON, "")
        .split(",")
        .map((rule) => rule.trim())
        .filter((rule) => rule.length > 0)

      return [{ line: content.slice(0, offset + comment.start).split("\n").length, rules }]
    })
  })
}
