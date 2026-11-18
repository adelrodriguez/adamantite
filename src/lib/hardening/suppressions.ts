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
 * Text that a disable comment or a TypeScript directive has.
 */
const SUPPRESSION_TEXT = /-disable|@ts-/iu

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
function readDisabledRules(comment: string): ReadonlyArray<string | undefined> {
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
 * The TypeScript directives that turn type checks off, as TypeScript reads them. In a `//` comment,
 * `@ts-expect-error` and `@ts-ignore` come first, after an optional third `/`. In a `/* *\/`
 * comment, as in JSX, they start the last line, after optional `/` and `*` characters.
 * `@ts-nocheck` is a `//` comment before the first code of the file, and its name ignores case.
 * TypeScript matches a prefix, so `@ts-ignored` turns checks off too.
 */
const LINE_DIRECTIVE = /^\/?\s*@(ts-expect-error|ts-ignore)/u
const BLOCK_DIRECTIVE = /^[*/]*\s*@(ts-expect-error|ts-ignore)/u
const PRAGMA = /^\/?\s*@([^\s:]+)(?:(?:[^\S\n\r]|:).*)?$/u
const LINE_BREAK = /\r\n?|[\n\u2028\u2029]/u

/**
 * A TypeScript directive that turns type checks off.
 */
export const Directive = Schema.Literals(["@ts-expect-error", "@ts-ignore", "@ts-nocheck"])

export type Directive = typeof Directive.Type

const decodeDirective = Schema.decodeUnknownOption(Directive)

/**
 * A comment as the probe reads it: its text without the comment markers, its kind, and whether only
 * whitespace and other comments come before it.
 */
interface ProbedComment {
  readonly leading: boolean
  readonly type: "Block" | "Line"
  readonly value: string
}

/**
 * The TypeScript directive of a comment, or none when TypeScript reads no directive in it.
 */
function readTypeScriptDirective({ leading, type, value }: ProbedComment) {
  const name =
    type === "Block"
      ? BLOCK_DIRECTIVE.exec((value.split(LINE_BREAK).at(-1) ?? "").trimStart())?.[1]
      : LINE_DIRECTIVE.exec(value)?.[1]

  if (name !== undefined) {
    return decodeDirective(`@${name}`)
  }

  const pragma = type === "Line" && leading ? PRAGMA.exec(value)?.[1]?.toLowerCase() : undefined

  return pragma === "ts-nocheck" ? Option.some<Directive>("@ts-nocheck") : Option.none<Directive>()
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
 * The comments of one TypeScript directive that turns type checks off.
 */
export const DirectiveSuppressions = Schema.Struct({
  directive: Directive,
  /**
   * Each comment as `<file>:<line>`, with the file relative to the project root.
   */
  locations: Schema.Array(Schema.String),
})

export type DirectiveSuppressions = typeof DirectiveSuppressions.Type

/**
 * The comments that turn checks off. A disable comment turns off lint rules and a TypeScript
 * directive turns off type checks, so each list has its own key: the rule or the directive.
 */
export const Suppressions = Schema.Struct({
  /**
   * The comments of each TypeScript directive, the directive with the most comments first.
   */
  directives: Schema.Array(DirectiveSuppressions),
  /**
   * The disable comments of each rule, the rule with the most comments first.
   */
  rules: Schema.Array(RuleSuppressions),
})

export type Suppressions = typeof Suppressions.Type

const byCount = Order.mapInput(
  Order.flip(Order.Number),
  (entry: { readonly locations: readonly string[] }) => entry.locations.length
)

/**
 * Counts the disable comments of each rule, and the comments of each TypeScript directive, in the
 * files that Oxlint lints in `scope`, a folder relative to `cwd`, or in the whole project when
 * `scope` is `null`. A comment in a file that the config ignores turns no rule off, so it does not
 * count. None when Oxlint cannot list its files or read their comments.
 */
export const readSuppressions = Effect.fn("readSuppressions")(function* (
  cwd: string,
  scope: ProjectPath | null
) {
  const path = yield* Path.Path
  const files = yield* listLintedFiles(cwd).pipe(Effect.option)

  if (Option.isNone(files)) {
    return Option.none<Suppressions>()
  }

  const isInScope = (file: string) =>
    scope === null || scope === "." || file.startsWith(`${scope}/`)

  // Most files have no such comment, so Oxlint parses only the files that can have one.
  const candidates = yield* Effect.filter(
    files.value.filter((file) => SOURCE_FILE.test(file) && isInScope(file)),
    (file) =>
      readFileIfFile(path.join(cwd, file)).pipe(
        Effect.map((content) => Option.exists(content, (text) => SUPPRESSION_TEXT.test(text)))
      ),
    { concurrency: 16 }
  )

  const probed = yield* probeComments(cwd, candidates).pipe(Effect.option)

  return Option.map(probed, (sources): Suppressions => {
    const comments = sources.flatMap(({ comments: found, file }) =>
      found.map((comment) => ({ ...comment, location: `${file}:${comment.line}` }))
    )

    const byRule = Array.groupBy(
      comments.flatMap((comment) =>
        readDisabledRules(comment.value).map((rule) => ({
          location: comment.location,
          rule: Option.fromUndefinedOr(rule),
        }))
      ),
      (entry) => Option.getOrElse(entry.rule, () => "")
    )

    const byDirective = Array.groupBy(
      comments.flatMap((comment) =>
        Option.toArray(readTypeScriptDirective(comment)).map((directive) => ({
          directive,
          location: comment.location,
        }))
      ),
      (entry) => entry.directive
    )

    return {
      directives: Array.sort(
        Object.values(byDirective).map((entries): DirectiveSuppressions => ({
          directive: entries[0].directive,
          locations: entries.map((entry) => entry.location),
        })),
        Order.combine(
          byCount,
          Order.mapInput(Order.String, (entry: DirectiveSuppressions) => entry.directive)
        )
      ),
      rules: Array.sort(
        Object.values(byRule).map((entries): RuleSuppressions => ({
          locations: entries.map((entry) => entry.location),
          rule: entries[0].rule,
        })),
        Order.combine(
          byCount,
          Order.mapInput(Order.String, (entry: RuleSuppressions) =>
            Option.getOrElse(entry.rule, () => "")
          )
        )
      ),
    }
  })
})
