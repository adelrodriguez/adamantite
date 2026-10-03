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

/**
 * The module that exports `custom()`.
 */
export const CUSTOM_RULES_MODULE = "adamantite/lint/custom"

const DEFAULT_PLUGIN_NAME = "project"
const DEFAULT_DIRECTORY = ".adamantite/rules"

const RULE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([".js", ".mjs", ".mts", ".ts"])

/**
 * Whether a file in a rules folder is a rule. Keep this the same as `isRuleFile` in
 * `presets/lint/custom.ts`, which decides what Oxlint loads.
 */
export function isRuleFile(name: string): boolean {
  const extension = /\.[^.]+$/.exec(name)?.[0] ?? ""

  return RULE_FILE_EXTENSIONS.has(extension) && !name.startsWith("_") && !/\.d\.m?ts$/.test(name)
}

/**
 * A `custom()` call. `dir` is relative to the file that holds the call. A `null` value is an
 * argument that is not a string literal, which only running the config can resolve.
 */
export interface CustomRulesCall {
  readonly dir: string | null
  readonly name: string | null
}

function parse(file: string, content: string) {
  return parseSync(file, content, { preserveParens: false, sourceType: "module" })
}

function getDefaultImportName(program: Program, moduleName: string) {
  return program.body
    .flatMap((statement) =>
      statement.type === "ImportDeclaration" && statement.source.value === moduleName
        ? statement.specifiers
        : []
    )
    .find((specifier) => specifier.type === "ImportDefaultSpecifier")?.local.name
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

function readCallOptions(options: ObjectExpression): CustomRulesCall {
  let dir: string | null = DEFAULT_DIRECTORY
  let name: string | null = DEFAULT_PLUGIN_NAME

  for (const property of options.properties) {
    if (property.type === "SpreadElement" || property.computed) {
      return { dir: null, name: null }
    }

    const key =
      property.key.type === "Identifier" ? property.key.name : getPropertyKey(property.key)

    if (key === "dir") {
      dir = getStaticString(property.value)
    } else if (key === "name") {
      name = getStaticString(property.value)
    }
  }

  return { dir, name }
}

/**
 * The `custom()` calls in a module that imports `custom` from `adamantite/lint/custom`. A module
 * that does not parse has none.
 */
export function findCustomRulesCalls(file: string, content: string): CustomRulesCall[] {
  const parsed = parse(file, content)
  const localName = getDefaultImportName(parsed.program, CUSTOM_RULES_MODULE)

  if (parsed.errors.length > 0 || localName === undefined) {
    return []
  }

  const calls: CustomRulesCall[] = []
  const visitor = new Visitor({
    CallExpression(node) {
      if (node.callee.type !== "Identifier" || node.callee.name !== localName) {
        return
      }

      const [options] = node.arguments

      if (options === undefined) {
        calls.push({ dir: DEFAULT_DIRECTORY, name: DEFAULT_PLUGIN_NAME })
      } else if (options.type === "ObjectExpression") {
        calls.push(readCallOptions(options))
      } else {
        calls.push({ dir: null, name: null })
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
