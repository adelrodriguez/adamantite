import * as Array from "effect/Array"
import * as Data from "effect/Data"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import {
  parseSync,
  type Expression,
  type ObjectExpression,
  type ObjectProperty,
  type Program,
  Visitor,
} from "oxc-parser"
import { publicImport } from "#lib/shared/package-exports.ts"

export const CUSTOM_RULES_MODULE = publicImport("./rules")

/**
 * The removed custom-rules module. A test keeps it out of the export map.
 */
export const LEGACY_CUSTOM_RULES_MODULE = "adamantite/lint/custom"

const DEFAULT_PLUGIN_NAME = "project"

/**
 * The rules folder that `custom()` loads when no `dir` is given, relative to the file that calls
 * it. A test keeps it equal to `DEFAULT_DIRECTORY` in `presets/rules/folder.ts`.
 */
export const CUSTOM_RULES_DIRECTORY = ".adamantite/lint"

/**
 * The extensions of rule files. A test keeps them equal to the ones in `presets/rules/folder.ts`.
 */
export const RULE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([".js", ".mjs", ".mts", ".ts"])

/**
 * Whether a file in a rules folder is a rule. Keep this the same as `isRuleFile` in
 * `presets/rules/folder.ts`, which decides what Oxlint loads.
 */
export function isRuleFile(name: string): boolean {
  const extension = /\.[^.]+$/.exec(name)?.[0] ?? ""

  return (
    RULE_FILE_EXTENSIONS.has(extension)
    && !name.startsWith("_")
    && !/\.(?:d\.m?ts|test\.[^.]+)$/.test(name)
  )
}

/**
 * An optional test beside a rule. Helpers that start with `_` are not test entries.
 */
export function isRuleTestFile(name: string): boolean {
  return !name.startsWith("_") && /\.test\.(?:js|mjs|mts|ts)$/.test(name)
}

/**
 * A `custom()` call whose rules folder only running the config can resolve.
 */
export class DynamicCustomRulesCall extends Data.TaggedClass("Dynamic") {}

/**
 * A `custom()` call that gives its `dir` as a string literal, relative to the file that holds the
 * call, and its `name` when that is a string literal too.
 */
export class LiteralCustomRulesCall extends Data.TaggedClass("Literal")<{
  readonly dir: string
  readonly name: Option.Option<string>
}> {}

/**
 * A `custom()` call.
 */
export type CustomRulesCall = DynamicCustomRulesCall | LiteralCustomRulesCall

const DYNAMIC_CALL: CustomRulesCall = new DynamicCustomRulesCall()

function parse(file: string, content: string) {
  return parseSync(file, content, { preserveParens: false, sourceType: "module" })
}

function getCustomImportNames(program: Program) {
  return program.body
    .flatMap((statement) =>
      statement.type === "ImportDeclaration" && statement.source.value === CUSTOM_RULES_MODULE
        ? statement.specifiers
        : []
    )
    .filter((specifier) => specifier.type === "ImportDefaultSpecifier")
    .map((specifier) => specifier.local.name)
}

function getStaticString(expression: Expression) {
  if (expression.type === "Literal" && Predicate.isString(expression.value)) {
    return expression.value
  }

  if (expression.type === "TemplateLiteral" && expression.expressions.length === 0) {
    return expression.quasis[0]?.value.cooked ?? null
  }

  return null
}

function getPropertyKey(key: ObjectProperty["key"]) {
  return key.type === "Literal" && Predicate.isString(key.value) ? key.value : null
}

/**
 * The string literal of an option, the default when the call omits the option, or none when the
 * value is not a string literal. A later property wins, as in a JavaScript object.
 */
function readStringOption(properties: readonly ObjectProperty[], key: string, fallback: string) {
  const property = pipe(
    properties,
    Array.findLast(
      (candidate) =>
        (candidate.key.type === "Identifier" ? candidate.key.name : getPropertyKey(candidate.key))
        === key
    )
  )

  return Option.fromNullOr(
    Option.match(property, {
      onNone: () => fallback,
      onSome: ({ value }) => getStaticString(value),
    })
  )
}

/**
 * Reads the options object of a call. A call without options passes no property, so it gets the
 * defaults, as `custom()` does.
 */
function readCallOptions(options: ObjectExpression["properties"]): CustomRulesCall {
  const properties = options.filter(
    (property): property is ObjectProperty =>
      property.type !== "SpreadElement" && !property.computed
  )

  // A spread or a computed key can set any option.
  if (properties.length < options.length) {
    return DYNAMIC_CALL
  }

  return Option.match(readStringOption(properties, "dir", CUSTOM_RULES_DIRECTORY), {
    onNone: () => DYNAMIC_CALL,
    onSome: (dir): CustomRulesCall =>
      new LiteralCustomRulesCall({
        dir,
        name: readStringOption(properties, "name", DEFAULT_PLUGIN_NAME),
      }),
  })
}

/**
 * The `custom()` calls in a module that imports `custom` from `adamantite/rules`. A module that
 * does not parse has none.
 */
export function findCustomRulesCalls(file: string, content: string): CustomRulesCall[] {
  const parsed = parse(file, content)
  const localNames = getCustomImportNames(parsed.program)

  if (parsed.errors.length > 0 || localNames.length === 0) {
    return []
  }

  const calls: CustomRulesCall[] = []

  const visitor = new Visitor({
    CallExpression(node) {
      if (node.callee.type !== "Identifier" || !localNames.includes(node.callee.name)) {
        return
      }

      const [options] = node.arguments

      if (options === undefined) {
        calls.push(readCallOptions([]))
      } else if (options.type === "ObjectExpression") {
        calls.push(readCallOptions(options.properties))
      } else {
        calls.push(DYNAMIC_CALL)
      }
    },
  })

  visitor.visit(parsed.program)

  return calls
}

/**
 * The modules that a module imports or re-exports at runtime. Type-only imports are left out. A
 * module that does not parse imports none.
 */
export function findRuntimeImports(file: string, content: string): string[] {
  const parsed = parse(file, content)

  if (parsed.errors.length > 0) {
    return []
  }

  return parsed.program.body.flatMap((statement) => {
    switch (statement.type) {
      case "ImportDeclaration":
        return statement.importKind === "type" ? [] : [statement.source.value]

      case "ExportAllDeclaration":
      case "ExportNamedDeclaration":
        return statement.source === null || statement.exportKind === "type"
          ? []
          : [statement.source.value]

      default:
        return []
    }
  })
}
