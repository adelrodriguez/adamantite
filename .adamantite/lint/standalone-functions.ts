// `adamantite/rules/plugin` resolves to `dist`, which the tests and the editor Oxlint do not build first.
import { defineRule, type ESTree } from "#presets/rules/plugin.ts"

// A standalone function is a function declaration. An arrow is for a callback, an object method, or
// a function that directly returns an Effect chain, such as
// `(path: string) => FileSystem.FileSystem.pipe(Effect.flatMap((fs) => fs.exists(path)))`. The two
// forms keep the plain helpers apart from the Effect composition.
//
// The rule reports a module-level variable whose value is a function that cannot directly return an
// Effect chain: a function expression, an async arrow, an arrow with a block body, and an arrow that
// can return a plain value, such as an object or a comparison. A rule gets no types, so the rule
// accepts an arrow that returns anything else, such as a call. `CODING_STANDARDS.md` keeps that
// part of the standard.

// The expressions whose value is never an Effect.
const PLAIN_VALUES = new Set([
  "ArrayExpression",
  "BinaryExpression",
  "Literal",
  "ObjectExpression",
  "TemplateLiteral",
  "UnaryExpression",
])

// Whether `node` is a function that cannot directly return an Effect chain.
function isPlainFunction(node: ESTree.Node): boolean {
  if (node.type === "FunctionExpression") {
    return true
  }

  if (node.type !== "ArrowFunctionExpression") {
    return false
  }

  // An async arrow returns a promise, and a block body returns nothing directly.
  return node.async || node.body.type === "BlockStatement" || canBePlain(node.body)
}

// Whether `node` can give a value that is not an Effect.
function canBePlain(node: ESTree.Node): boolean {
  if (PLAIN_VALUES.has(node.type)) {
    return true
  }

  // A TypeScript expression keeps the value of the expression that it wraps, such as
  // `value as const`.
  if (
    node.type === "TSAsExpression"
    || node.type === "TSNonNullExpression"
    || node.type === "TSSatisfiesExpression"
  ) {
    return canBePlain(node.expression)
  }

  if (node.type === "ConditionalExpression") {
    return canBePlain(node.consequent) || canBePlain(node.alternate)
  }

  // `left && right` gives `left` when it is falsy. `||` and `??` give one of their two sides.
  if (node.type === "LogicalExpression") {
    return node.operator === "&&" || canBePlain(node.left) || canBePlain(node.right)
  }

  // An arrow that returns a function, such as `(status) => (message) => Effect.log(message)`,
  // returns what that function returns.
  return isPlainFunction(node)
}

export default defineRule({
  createOnce(context) {
    return {
      VariableDeclarator(node) {
        const scope = node.parent.parent

        if (scope?.type !== "Program" && scope?.type !== "ExportNamedDeclaration") {
          return
        }

        if (node.id.type !== "Identifier" || node.init === null || !isPlainFunction(node.init)) {
          return
        }

        context.report({ data: { name: node.id.name }, messageId: "declare", node: node.id })
      },
    }
  },
  meta: {
    docs: {
      description:
        "Require a function declaration for a module-level function that cannot directly return an Effect chain.",
    },
    messages: {
      declare:
        "Declare `{{name}}` as `function {{name}}(…) { … }`. An arrow is for a callback, an object method, or a function that directly returns an Effect chain. See CODING_STANDARDS.md.",
    },
    schema: [],
    type: "suggestion",
  },
})
