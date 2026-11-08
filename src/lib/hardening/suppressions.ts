import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { parseSync } from "oxc-parser"
import { listLintedFiles } from "#lib/hardening/oxlint.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"

/**
 * The comments that turn off one rule, or all rules.
 */
export interface RuleSuppressions {
  /**
   * Each comment as `<file>:<line>`, with the file relative to the project root.
   */
  readonly locations: readonly string[]
  /**
   * The rule, or none for a comment that names no rule and so turns off all rules.
   */
  readonly rule: Option.Option<string>
}

/**
 * The files that Oxlint parses with its JavaScript and TypeScript parser. Oxlint also lints the
 * scripts of Vue, Svelte, and Astro files, but this parser cannot read them.
 */
const SOURCE_FILE = /\.[cm]?[jt]sx?$/u

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

/**
 * Counts the disable comments of each rule in the files that Oxlint lints in `scope`, a folder
 * relative to `cwd`, or in the whole project when `scope` is `null`. A comment in a file that the
 * config ignores turns nothing off, so it does not count. The rule with the most comments comes
 * first. None when Oxlint cannot list its files.
 */
export const readSuppressions = Effect.fn("readSuppressions")(function* (
  cwd: string,
  scope: string | null
) {
  const path = yield* Path.Path
  const files = yield* listLintedFiles(cwd).pipe(Effect.option)

  const isInScope = (file: string) =>
    scope === null || scope === "." || file.startsWith(`${scope}/`)

  return yield* Effect.transposeOption(
    files.pipe(
      Option.map((listed) =>
        Effect.gen(function* () {
          const found = yield* Effect.forEach(
            listed.filter((file) => SOURCE_FILE.test(file) && isInScope(file)),
            (file) =>
              readFileIfExists(path.join(cwd, file)).pipe(
                Effect.orElseSucceed(() => Option.none<string>()),
                Effect.map((content) =>
                  Option.match(content, {
                    onNone: () => [],
                    // Most files have no disable comment, so only those files are parsed.
                    onSome: (text) =>
                      text.includes("-disable")
                        ? findSuppressions(file, text).flatMap(({ line, rules }) =>
                            // A comment that names no rule turns off all rules.
                            (rules.length === 0 ? [undefined] : rules).map((rule) => ({
                              location: `${file}:${line}`,
                              rule: Option.fromUndefinedOr(rule),
                            }))
                          )
                        : [],
                  })
                )
              ),
            { concurrency: 16 }
          )

          const byRule = Array.groupBy(found.flat(), (entry) =>
            Option.getOrElse(entry.rule, () => "")
          )

          return Array.sort(
            Object.values(byRule).map((entries): RuleSuppressions => ({
              locations: entries.map((entry) => entry.location),
              rule: entries[0].rule,
            })),
            Order.combine(
              Order.mapInput(
                Order.flip(Order.Number),
                (entry: RuleSuppressions) => entry.locations.length
              ),
              Order.mapInput(Order.String, (entry: RuleSuppressions) =>
                Option.getOrElse(entry.rule, () => "")
              )
            )
          )
        })
      )
    )
  )
})
