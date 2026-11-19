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

const SOURCE_FILE = /(?:\.[cm]?[jt]sx?|\.(?:vue|svelte|astro))$/u

const SUPPRESSION_TEXT = /-disable|@ts-/iu

/**
 * A comment that turns rules off. Oxlint obeys the `eslint-disable` comments too. The rule names
 * come after the directive, and a reason can follow ` -- `.
 */
const DISABLE_DIRECTIVE =
  /^\s*(?:oxlint|eslint)-disable(?:-next-line|-line)?(?:\s(?<rules>[\s\S]*))?$/u

const REASON = /\s--[\s\S]*$/u

function readDisabledRules(comment: string): ReadonlyArray<Option.Option<string>> {
  const match = DISABLE_DIRECTIVE.exec(comment)

  if (match === null) {
    return []
  }

  const rules = (match.groups?.["rules"] ?? "")
    .replace(REASON, "")
    .split(",")
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0)

  // A disable comment that names no rule turns off all rules.
  return rules.length === 0 ? [Option.none()] : rules.map((rule) => Option.some(rule))
}

/**
 * The TypeScript directives that turn type checks off, as TypeScript reads them. In a `//` comment,
 * `@ts-expect-error` and `@ts-ignore` come first, after an optional third `/`. In a `/* *\/`
 * comment, as in JSX, they start the last line of the comment's source text, after optional `/` and
 * `*` characters. On a single line, that text starts with `/*`, so `/* * @ts-ignore *\/` has a
 * space between the markers and the directive, and is no directive. `@ts-nocheck` is a `//` comment
 * before the first code of the file, and its name ignores case. TypeScript matches a prefix, so
 * `@ts-ignored` turns checks off too.
 */
const LINE_DIRECTIVE = /^\/?\s*@(ts-expect-error|ts-ignore)/u
const BLOCK_DIRECTIVE = /^[*/]*\s*@(ts-expect-error|ts-ignore)/u
const PRAGMA = /^\/?\s*@([^\s:]+)(?:(?:[^\S\n\r]|:).*)?$/u
const LINE_BREAK = /\r\n?|[\n\u2028\u2029]/u

export const Directive = Schema.Literals(["@ts-expect-error", "@ts-ignore", "@ts-nocheck"])

export type Directive = typeof Directive.Type

const decodeDirective = Schema.decodeUnknownOption(Directive)

interface ProbedComment {
  readonly leading: boolean
  readonly type: "Block" | "Line"
  readonly value: string
}

/**
 * The last line of the source text of a `/* *\/` comment, as TypeScript reads it. Oxlint gives the
 * text without its markers, and the opening marker is on the last line when the comment has one
 * line. The closing marker comes after the directive, so it does not change the match.
 */
function readLastLine(value: string) {
  const lines = value.split(LINE_BREAK)

  return lines.length === 1 ? `/*${value}` : (lines.at(-1) ?? "")
}

function readTypeScriptDirective({ leading, type, value }: ProbedComment) {
  const name =
    type === "Block"
      ? BLOCK_DIRECTIVE.exec(readLastLine(value).trimStart())?.[1]
      : LINE_DIRECTIVE.exec(value)?.[1]

  if (name !== undefined) {
    return decodeDirective(`@${name}`)
  }

  const pragma = type === "Line" && leading ? PRAGMA.exec(value)?.[1]?.toLowerCase() : undefined

  return pragma === "ts-nocheck" ? Option.some<Directive>("@ts-nocheck") : Option.none<Directive>()
}

const Location = Schema.TemplateLiteral([Schema.String, ":", Schema.Int])

export const RuleSuppressions = Schema.Struct({
  locations: Schema.Array(Location),
  rule: Schema.OptionFromNullOr(Schema.String),
})

export type RuleSuppressions = typeof RuleSuppressions.Type

export const DirectiveSuppressions = Schema.Struct({
  directive: Directive,
  locations: Schema.Array(Location),
})

export type DirectiveSuppressions = typeof DirectiveSuppressions.Type

export const Suppressions = Schema.Struct({
  directives: Schema.Array(DirectiveSuppressions),
  rules: Schema.Array(RuleSuppressions),
})

export type Suppressions = typeof Suppressions.Type

const byCount = Order.mapInput(
  Order.flip(Order.Number),
  (entry: { readonly locations: readonly string[] }) => entry.locations.length
)

export const readSuppressions = Effect.fn("readSuppressions")(function* (
  cwd: string,
  scope: ProjectPath | null
) {
  const path = yield* Path.Path
  // A comment in a file that the config ignores turns no rule off, so only linted files count.
  const files = yield* listLintedFiles(cwd).pipe(Effect.option)

  if (Option.isNone(files)) {
    return Option.none<Suppressions>()
  }

  function isInScope(file: string) {
    return scope === null || scope === "." || file.startsWith(`${scope}/`)
  }

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
      found.map((comment) => ({ ...comment, location: `${file}:${comment.line}` as const }))
    )

    const byRule = Array.groupBy(
      comments.flatMap((comment) =>
        readDisabledRules(comment.value).map((rule) => ({
          location: comment.location,
          rule,
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
