import type { Comment, Context, ESTree, Plugin, Rule, Visitor } from "@oxlint/plugins"

// The facts that only a parser knows, such as the disable comments of a file and its syntax tree,
// come from Oxlint itself. `lib/integrations/oxlint/probe.ts` runs Oxlint with only this plugin and
// decodes its reports. Oxlint runs this module in the target project, so it imports only types.
//
// Each rule reports one JSON message for each source that Oxlint parses: a file, or each script of
// a Vue, Svelte, or Astro file. A disable comment can turn off a report, so the rule reports the
// message twice, at the start and at the end of the source. Oxlint moves each report to its place in
// the file, so the line of a report tells where the source starts or ends.

/**
 * A comment that can turn lint rules or type checks off: a disable comment, or a TypeScript
 * directive such as `@ts-expect-error`. The CLI reads the directive.
 */
const SUPPRESSION_COMMENT = /-disable|@ts-/iu

/**
 * What a rule reports about a source.
 */
type Fact =
  | {
      /**
       * Each comment that can turn lint rules or type checks off, with its line in the source, its
       * kind, and whether only whitespace and other comments come before it, as TypeScript requires
       * of `@ts-nocheck`.
       */
      readonly comments: ReadonlyArray<{
        readonly leading: boolean
        readonly line: number
        readonly type: "Block" | "Line"
        readonly value: string
      }>
    }
  | { readonly program: ESTree.Program }

/**
 * A value in a fact. A literal node holds a `bigint` or a `RegExp` value.
 */
type FactValue =
  | ESTree.Node
  | Fact
  | bigint
  | boolean
  | null
  | number
  | readonly FactValue[]
  | RegExp
  | string
  | undefined

/**
 * Writes a value of a fact as JSON. A node links to its parent, so the tree leaves the link out,
 * and JSON has no `bigint`, so a `bigint` becomes its digits.
 */
function writeFactValue(key: string, value: FactValue) {
  if (typeof value === "bigint") {
    return value.toString()
  }

  return key === "parent" ? undefined : value
}

/**
 * Reports `fact` at the start and at the end of the source, with the number of lines of the source.
 */
function reportTwice(context: Context, fact: Fact) {
  const { lines, text } = context.sourceCode
  const start = { column: 0, line: 1 }
  const end = context.sourceCode.getLocFromIndex(text.length)

  function encode(anchor: string) {
    return JSON.stringify({ anchor, lines: lines.length, ...fact }, writeFactValue)
  }

  context.report({ loc: { end: start, start }, message: encode("start") })
  context.report({ loc: { end, start: end }, message: encode("end") })
}

/**
 * Whether only whitespace and other comments come before each of `comments`, in source order. The
 * first comment with code before it, and each comment after it, does not lead.
 */
function readLeading(text: string, comments: readonly Comment[]) {
  const firstAfterCode = comments.findIndex(
    (comment, index) => text.slice(comments[index - 1]?.end ?? 0, comment.start).trim().length > 0
  )

  return comments.map((_, index) => firstAfterCode === -1 || index < firstAfterCode)
}

const comments: Rule = {
  create(context): Visitor {
    return {
      Program() {
        const all = context.sourceCode.getAllComments()
        const leading = readLeading(context.sourceCode.text, all)

        reportTwice(context, {
          comments: all.flatMap((comment, index) =>
            comment.type !== "Shebang" && SUPPRESSION_COMMENT.test(comment.value)
              ? [
                  {
                    leading: leading[index] ?? false,
                    line: comment.loc.start.line,
                    type: comment.type,
                    value: comment.value,
                  },
                ]
              : []
          ),
        })
      },
    }
  },
  meta: {
    docs: { description: "Report the comments that turn lint rules or type checks off." },
    schema: [],
  },
}

const ast: Rule = {
  create(context): Visitor {
    return {
      Program(program) {
        reportTwice(context, { program })
      },
    }
  },
  meta: { docs: { description: "Report the syntax tree of each source." }, schema: [] },
}

const plugin: Plugin = { meta: { name: "adamantite-probe" }, rules: { ast, comments } }

export default plugin
