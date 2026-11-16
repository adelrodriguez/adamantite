import type { Context, ESTree, Plugin, Rule, Visitor } from "@oxlint/plugins"

// The facts that only a parser knows, such as the disable comments of a file and its syntax tree,
// come from Oxlint itself. `lib/integrations/oxlint/probe.ts` runs Oxlint with only this plugin and
// decodes its reports. Oxlint runs this module in the target project, so it imports only types.
//
// Each rule reports one JSON message for each source that Oxlint parses: a file, or each script of
// a Vue, Svelte, or Astro file. A disable comment can turn off a report, so the rule reports the
// message twice, at the start and at the end of the source. Oxlint moves each report to its place in
// the file, so the line of a report tells where the source starts or ends.

/**
 * A comment that can turn rules off. The CLI reads the directive.
 */
const DISABLE_COMMENT = /-disable/u

/**
 * What a rule reports about a source.
 */
type Fact =
  | {
      /**
       * Each disable comment, with its line in the source.
       */
      readonly comments: ReadonlyArray<{ readonly line: number; readonly value: string }>
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

  const encode = (anchor: string) =>
    JSON.stringify({ anchor, lines: lines.length, ...fact }, writeFactValue)

  context.report({ loc: { end: start, start }, message: encode("start") })
  context.report({ loc: { end, start: end }, message: encode("end") })
}

const comments: Rule = {
  create(context): Visitor {
    return {
      Program() {
        reportTwice(context, {
          comments: context.sourceCode
            .getAllComments()
            .filter((comment) => DISABLE_COMMENT.test(comment.value))
            .map((comment) => ({ line: comment.loc.start.line, value: comment.value })),
        })
      },
    }
  },
  meta: { docs: { description: "Report the disable comments of each source." }, schema: [] },
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
