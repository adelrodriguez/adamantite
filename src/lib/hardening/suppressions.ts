import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import type { ProjectPath } from "#lib/hardening/project-files.ts"
import { listLintedFiles } from "#lib/integrations/oxlint/files.ts"
import { probeComments } from "#lib/integrations/oxlint/probe.ts"
import { readFileIfFile } from "#lib/shared/filesystem.ts"

/**
 * Source files and component files whose embedded scripts Oxlint lints.
 */
const SOURCE_FILE = /(?:\.[cm]?[jt]sx?|\.(?:vue|svelte|astro))$/u

/**
 * A comment that turns rules off. Oxlint obeys the `eslint-disable` comments too. The rule names
 * come after the directive, and a reason can follow ` -- `.
 */
const DISABLE_DIRECTIVE =
  /^\s*(?:oxlint|eslint)-disable(?:-next-line|-line)?(?:\s(?<rules>[\s\S]*))?$/u

const REASON = /\s--[\s\S]*$/u

/**
 * The rules that a disable comment names, or none when it is not a disable comment. A comment that
 * names no rule turns off all rules, so it names `[undefined]`.
 */
function readDirective(comment: string): ReadonlyArray<string | undefined> {
  const match = DISABLE_DIRECTIVE.exec(comment)

  if (match === null) {
    return []
  }

  const rules = (match.groups?.["rules"] ?? "")
    .replace(REASON, "")
    .split(",")
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0)

  return rules.length === 0 ? [undefined] : rules
}

/**
 * The comments that turn off one rule, or all rules.
 */
export const RuleSuppressions = Schema.Struct({
  /**
   * Each comment as `<file>:<line>`, with the file relative to the project root.
   */
  locations: Schema.Array(Schema.String),
  /**
   * The rule, or none for a comment that names no rule and so turns off all rules.
   */
  rule: Schema.OptionFromNullOr(Schema.String),
})

export type RuleSuppressions = typeof RuleSuppressions.Type

/**
 * Counts the disable comments of each rule in the files that Oxlint lints in `scope`, a folder
 * relative to `cwd`, or in the whole project when `scope` is `null`. A comment in a file that the
 * config ignores turns nothing off, so it does not count. The rule with the most comments comes
 * first. None when Oxlint cannot list its files or read their comments.
 */
export const readSuppressions = Effect.fn("readSuppressions")(function* (
  cwd: string,
  scope: ProjectPath | null
) {
  const path = yield* Path.Path
  const files = yield* listLintedFiles(cwd).pipe(Effect.option)

  if (Option.isNone(files)) {
    return Option.none<RuleSuppressions[]>()
  }

  const isInScope = (file: string) =>
    scope === null || scope === "." || file.startsWith(`${scope}/`)

  // Most files have no disable comment, so Oxlint parses only the files that can have one.
  const candidates = yield* Effect.filter(
    files.value.filter((file) => SOURCE_FILE.test(file) && isInScope(file)),
    (file) =>
      readFileIfFile(path.join(cwd, file)).pipe(
        Effect.map((content) => Option.exists(content, (text) => text.includes("-disable")))
      ),
    { concurrency: 16 }
  )

  const probed = yield* probeComments(cwd, candidates).pipe(Effect.option)

  return Option.map(probed, (sources) => {
    const found = sources.flatMap(({ comments, file }) =>
      comments.flatMap(({ line, value }) =>
        readDirective(value).map((rule) => ({
          location: `${file}:${line}`,
          rule: Option.fromUndefinedOr(rule),
        }))
      )
    )

    const byRule = Array.groupBy(found, (entry) => Option.getOrElse(entry.rule, () => ""))

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
})
