import type { Comment, Context, ESTree, Plugin, Rule, Visitor } from "@oxlint/plugins"

const SUPPRESSION_COMMENT = /-disable|@ts-/iu

type Fact =
  | {
      readonly comments: ReadonlyArray<{
        // TypeScript reads `@ts-nocheck` only when whitespace and other comments alone come before
        // it.
        readonly leading: boolean
        readonly line: number
        readonly type: "Block" | "Line"
        readonly value: string
      }>
    }
  | { readonly program: ESTree.Program }

// An ESTree literal node holds a `bigint` or a `RegExp` value.
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

// An Oxlint node links to its parent, and JSON has no `bigint`.
function writeFactValue(key: string, value: FactValue) {
  if (typeof value === "bigint") {
    return value.toString()
  }

  return key === "parent" ? undefined : value
}

// Oxlint parses each script of a Vue, Svelte, or Astro file as its own source, moves each report to
// its place in the file, and drops a report that a disable comment turns off.
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
