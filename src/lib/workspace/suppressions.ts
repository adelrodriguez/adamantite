import { parseSync } from "oxc-parser"

/**
 * The files that Oxlint parses with its JavaScript and TypeScript parser. Oxlint also lints the
 * scripts of Vue, Svelte, and Astro files, but this parser cannot read them.
 */
export const SOURCE_FILE = /\.[cm]?[jt]sx?$/u

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
  const { comments, errors } = parseSync(file, content)

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

    return [{ line: content.slice(0, comment.start).split("\n").length, rules }]
  })
}
