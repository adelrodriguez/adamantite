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
  type Statement,
  type TSGlobalDeclaration,
  type TSModuleDeclaration,
  Visitor,
} from "oxc-parser"

export const CUSTOM_RULES_MODULE = "adamantite/rules"

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

/**
 * Whether a module imports or re-exports the custom-rules API that Doctor must ask the project to
 * migrate. This does not load the old API or treat its custom() calls as current calls.
 */
export function hasLegacyRuleImports(file: string, content: string): boolean {
  const parsed = parse(file, content)

  if (parsed.errors.length > 0) {
    return false
  }

  return parsed.program.body.some((statement) => {
    if (statement.type === "ImportDeclaration") {
      return (
        statement.source.value === "adamantite/lint/custom"
        || (statement.source.value === CUSTOM_RULES_MODULE
          && statement.specifiers.some(
            (specifier) =>
              specifier.type === "ImportSpecifier"
              && (specifier.imported.type === "Identifier"
                ? specifier.imported.name
                : specifier.imported.value) !== "CustomRulesOptions"
          ))
      )
    }

    if (statement.type === "ExportNamedDeclaration" && statement.source !== null) {
      return (
        statement.source.value === "adamantite/lint/custom"
        || (statement.source.value === CUSTOM_RULES_MODULE
          && statement.specifiers.some((specifier) => {
            const name =
              specifier.local.type === "Identifier" ? specifier.local.name : specifier.local.value

            return name !== "default" && name !== "CustomRulesOptions"
          }))
      )
    }

    return (
      statement.type === "ExportAllDeclaration"
      && statement.source.value === "adamantite/lint/custom"
    )
  })
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

function getLine(content: string, offset: number) {
  return content.slice(0, offset).split("\n").length
}

function checkIsTypeOnlyStatement(statement: Statement): boolean {
  switch (statement.type) {
    case "TSInterfaceDeclaration":
    case "TSTypeAliasDeclaration":
      return true

    case "TSModuleDeclaration":
      return checkIsTypeOnlyModule(statement)

    case "ClassDeclaration":
    case "FunctionDeclaration":
    case "TSEnumDeclaration":
    case "VariableDeclaration":
      return statement.declare === true

    case "ExportNamedDeclaration":
      return statement.declaration === null
        ? statement.exportKind === "type"
        : checkIsTypeOnlyStatement(statement.declaration)

    default:
      return false
  }
}

function checkIsTypeOnlyModule(module: TSGlobalDeclaration | TSModuleDeclaration): boolean {
  return (
    module.kind === "global"
    || module.declare
    || module.body === null
    || module.body.body.every(
      (statement) => statement.type !== "ExpressionStatement" && checkIsTypeOnlyStatement(statement)
    )
  )
}

/**
 * Whether the module has a default export that survives type stripping. `export default interface`
 * and `export type { Rule as default }` are erased.
 */
function checkHasDefaultExport(program: Program) {
  return program.body.some((statement) => {
    if (statement.type === "ExportDefaultDeclaration") {
      return statement.declaration.type !== "TSInterfaceDeclaration"
    }

    return (
      statement.type === "ExportNamedDeclaration"
      && statement.exportKind !== "type"
      && statement.specifiers.some(
        (specifier) =>
          specifier.exportKind !== "type"
          && (specifier.exported.type === "Literal"
            ? specifier.exported.value === "default"
            : specifier.exported.name === "default")
      )
    )
  })
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

/**
 * The reasons that a rule file cannot load as a rule: syntax errors, TypeScript that type stripping
 * cannot erase, and a missing default export. Empty when the file can load.
 */
export function inspectRuleFile(file: string, content: string): string[] {
  const parsed = parse(file, content)

  if (parsed.errors.length > 0) {
    return parsed.errors.map((error) => `Syntax error: ${error.message}`)
  }

  const problems: string[] = []

  const report = (offset: number, construct: string) => {
    problems.push(
      `Line ${getLine(content, offset)}: ${construct} needs a TypeScript transform, which type stripping does not do.`
    )
  }

  const visitor = new Visitor({
    TSEnumDeclaration(node) {
      if (!node.declare) {
        report(node.start, "`enum`")
      }
    },
    TSExportAssignment(node) {
      report(node.start, "`export =`")
    },
    TSImportEqualsDeclaration(node) {
      if (node.importKind !== "type") {
        report(node.start, "`import x = ...`")
      }
    },
    TSModuleDeclaration(node) {
      if (!checkIsTypeOnlyModule(node)) {
        report(node.start, "A `namespace` with values")
      }
    },
    TSParameterProperty(node) {
      report(node.start, "A parameter property")
    },
  })

  visitor.visit(parsed.program)

  if (!checkHasDefaultExport(parsed.program)) {
    problems.push("The file has no default export. Export the rule as default.")
  }

  return problems
}
