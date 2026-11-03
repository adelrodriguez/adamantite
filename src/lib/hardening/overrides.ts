import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import {
  parseSync,
  type ArrayExpressionElement,
  type Expression,
  type ObjectExpression,
  type ObjectProperty,
  type Program,
} from "oxc-parser"
import { isReportOf, lintFiles, listBuiltInRules, listLintedFiles } from "#lib/hardening/oxlint.ts"
import { makeProjectCopy, renderOverrideTrialConfig, replaceConfig } from "#lib/hardening/trial.ts"
import { readFile } from "#lib/shared/filesystem.ts"

/**
 * An entry of `overrides` in an Oxlint config that turns one or more rules off.
 */
export interface RuleOffOverride {
  /**
   * The `files` of the override, as the config writes them, relative to the folder of the config.
   */
  readonly files: readonly string[]
  /**
   * The position of the override in `overrides`.
   */
  readonly index: number
  readonly rules: readonly string[]
}

/**
 * What Adamantite found for one file of an override that turns a rule off: the rule still reports
 * the file, the rule no longer reports it, the config ignores it, it does not parse, or it does not
 * exist. Only a file that Oxlint linted and parsed can be clean.
 */
export type OverrideFileMark = "breaks" | "clean" | "ignored" | "missing" | "unparsable"

/**
 * The files for which an override turns a rule off, with paths relative to the project root.
 */
export interface OverriddenRule {
  /**
   * The config of the override, relative to the project root.
   */
  readonly config: string
  readonly files: ReadonlyArray<{ readonly file: string; readonly mark: OverrideFileMark }>
  /**
   * The globs of the override, as the config writes them. A glob is a scope decision, so Adamantite
   * does not lint its files.
   */
  readonly globs: readonly string[]
  readonly rule: string
}

/**
 * The overrides that turn a rule off, or the reason why Adamantite could not lint their files.
 */
export type OverridesReport =
  | { readonly _tag: "Failed"; readonly reason: string }
  | { readonly _tag: "Linted"; readonly rules: readonly OverriddenRule[] }

const GLOB_CHARACTERS = /[!*?[\]{}]/u

function getStaticString(expression: Expression | ArrayExpressionElement) {
  if (expression === null) {
    return null
  }

  if (expression.type === "Literal" && Predicate.isString(expression.value)) {
    return expression.value
  }

  if (expression.type === "TemplateLiteral" && expression.expressions.length === 0) {
    return expression.quasis[0]?.value.cooked ?? null
  }

  return null
}

function getPropertyName(property: ObjectProperty) {
  if (property.computed) {
    return null
  }

  if (property.key.type === "Identifier") {
    return property.key.name
  }

  return property.key.type === "Literal" && Predicate.isString(property.key.value)
    ? property.key.value
    : null
}

function getProperty(object: ObjectExpression, name: string) {
  const property = object.properties.find(
    (candidate) => candidate.type === "Property" && getPropertyName(candidate) === name
  )

  return property?.type === "Property" ? property.value : undefined
}

/**
 * Whether a rule setting turns the rule off: `"off"`, `"allow"`, or `0`, alone or as the first item
 * of an array.
 */
function isOff(setting: Expression): boolean {
  if (setting.type === "ArrayExpression") {
    const [severity] = setting.elements

    return severity !== undefined && severity !== null && severity.type !== "SpreadElement"
      ? isOff(severity)
      : false
  }

  return (
    setting.type === "Literal"
    && (setting.value === "off" || setting.value === "allow" || setting.value === 0)
  )
}

/**
 * The object that the config exports: the argument of `defineConfig({ … })`, the object itself, or
 * the object of a top-level `const` that the default export names.
 */
function findConfigObject(program: Program): ObjectExpression | undefined {
  const [exported] = program.body.flatMap((statement) =>
    statement.type === "ExportDefaultDeclaration" ? [statement] : []
  )

  if (exported === undefined) {
    return undefined
  }

  const unwrap = (expression: Expression): ObjectExpression | undefined => {
    if (expression.type === "ObjectExpression") {
      return expression
    }

    if (expression.type === "CallExpression") {
      const [argument] = expression.arguments

      return argument !== undefined && argument.type !== "SpreadElement"
        ? unwrap(argument)
        : undefined
    }

    if (expression.type === "Identifier") {
      const declarator = program.body
        .flatMap((statement) =>
          statement.type === "VariableDeclaration"
            ? statement.declarations
            : statement.type === "ExportNamedDeclaration"
                && statement.declaration?.type === "VariableDeclaration"
              ? statement.declaration.declarations
              : []
        )
        .find(
          (candidate) => candidate.id.type === "Identifier" && candidate.id.name === expression.name
        )

      return declarator?.init ? unwrap(declarator.init) : undefined
    }

    if (expression.type === "TSAsExpression" || expression.type === "TSSatisfiesExpression") {
      return unwrap(expression.expression)
    }

    return undefined
  }

  const declaration = exported.declaration

  return declaration.type === "ObjectExpression"
    || declaration.type === "CallExpression"
    || declaration.type === "Identifier"
    || declaration.type === "TSAsExpression"
    || declaration.type === "TSSatisfiesExpression"
    ? unwrap(declaration)
    : undefined
}

/**
 * The overrides of an Oxlint config that turn a rule off and list their `files` as strings. The
 * file is read without running it, so an override that code builds, such as a spread or a call, is
 * not in the list. A spread in `overrides` hides the positions after it, so the list stops there.
 */
export function findRuleOffOverrides(file: string, content: string): RuleOffOverride[] {
  const { errors, program } = parseSync(file, content, { sourceType: "module" })

  if (errors.length > 0) {
    return []
  }

  const config = findConfigObject(program)
  const overrides = config === undefined ? undefined : getProperty(config, "overrides")

  if (overrides?.type !== "ArrayExpression") {
    return []
  }

  const spread = overrides.elements.findIndex((element) => element?.type === "SpreadElement")
  const elements = spread === -1 ? overrides.elements : overrides.elements.slice(0, spread)

  return elements.flatMap((element, index) => {
    if (element?.type !== "ObjectExpression") {
      return []
    }

    const files = getProperty(element, "files")
    const rules = getProperty(element, "rules")

    if (files?.type !== "ArrayExpression" || rules?.type !== "ObjectExpression") {
      return []
    }

    const patterns = files.elements.map((pattern) => getStaticString(pattern))
    const offRules = rules.properties.flatMap((property) => {
      const name = property.type === "Property" ? getPropertyName(property) : null

      return property.type === "Property" && name !== null && isOff(property.value) ? [name] : []
    })

    return patterns.every((pattern) => pattern !== null) && offRules.length > 0
      ? [{ files: patterns, index, rules: offRules }]
      : []
  })
}

/**
 * Lints the files that each override of `configs` turns a rule off for, in a copy of the project
 * with the rule on again, and marks each file. Only the files inside `scope` count. A glob is not
 * linted. One Oxlint run covers each config.
 */
export const readOverrides = Effect.fn("readOverrides")(
  function* (cwd: string, configs: readonly string[], scope: string | null) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const isInScope = (file: string) =>
      scope === null || scope === "." || file === scope || file.startsWith(`${scope}/`)
    const toProjectPath = (config: string, file: string) =>
      path
        .relative(cwd, path.join(cwd, path.dirname(config), file))
        .split(path.sep)
        .join("/")
    const found = yield* Effect.forEach(
      configs,
      (config) =>
        readFile(path.join(cwd, config)).pipe(
          Effect.map((content) => ({ config, overrides: findRuleOffOverrides(config, content) }))
        ),
      { concurrency: "unbounded" }
    )
    const entries = found.flatMap(({ config, overrides }) =>
      overrides.flatMap((override) =>
        override.rules.map((rule) => ({
          config,
          globs: override.files.filter((file) => GLOB_CHARACTERS.test(file)),
          index: override.index,
          literals: override.files
            .filter((file) => !GLOB_CHARACTERS.test(file))
            .map((file) => toProjectPath(config, file))
            .filter((file) => isInScope(file)),
          rule,
        }))
      )
    )
    const existing = new Set(
      yield* Effect.filter(
        Array.dedupe(entries.flatMap((entry) => entry.literals)),
        (file) => fs.exists(path.join(cwd, file)).pipe(Effect.orElseSucceed(() => false)),
        { concurrency: "unbounded" }
      )
    )
    const linted = entries.filter((entry) => entry.literals.some((file) => existing.has(file)))
    const marks = new Map<string, OverrideFileMark>()

    if (linted.length > 0) {
      const builtIns = yield* listBuiltInRules(cwd)
      const copy = yield* makeProjectCopy(cwd)

      for (const config of Array.dedupe(linted.map((entry) => entry.config))) {
        const removals = new Map<number, string[]>()

        for (const entry of linted.filter((candidate) => candidate.config === config)) {
          removals.set(entry.index, [...(removals.get(entry.index) ?? []), entry.rule])
        }

        yield* replaceConfig(path.join(copy, config), (base) =>
          renderOverrideTrialConfig({ config: base, removals })
        )
      }

      // Oxlint runs from the root, as a project lint does, so each file gets the options of the
      // root config and the rules of its nearest config.
      const files = Array.dedupe(linted.flatMap((entry) => entry.literals)).filter((file) =>
        existing.has(file)
      )
      const report = yield* lintFiles(copy, files)
      const listed = new Set(
        report.number_of_files < files.length ? yield* listLintedFiles(copy, files) : files
      )
      const unparsable = new Set(
        report.diagnostics
          .filter((diagnostic) => diagnostic.code === undefined)
          .map((diagnostic) => diagnostic.filename)
      )

      for (const entry of linted) {
        for (const file of entry.literals.filter((literal) => existing.has(literal))) {
          const breaks = report.diagnostics.some(
            (diagnostic) =>
              diagnostic.filename === file
              && diagnostic.code !== undefined
              && isReportOf(diagnostic.code, entry.rule, builtIns)
          )
          const mark: OverrideFileMark = listed.has(file)
            ? unparsable.has(file)
              ? "unparsable"
              : breaks
                ? "breaks"
                : "clean"
            : "ignored"

          marks.set(`${entry.rule}\0${file}`, mark)
        }
      }
    }

    return {
      _tag: "Linted",
      rules: entries
        .filter((entry) => entry.literals.length > 0 || entry.globs.length > 0)
        .map((entry): OverriddenRule => ({
          config: entry.config,
          files: entry.literals.map((file) => ({
            file,
            mark: marks.get(`${entry.rule}\0${file}`) ?? "missing",
          })),
          globs: entry.globs,
          rule: entry.rule,
        })),
    } satisfies OverridesReport
  },
  Effect.scoped,
  Effect.catch((error) =>
    Effect.succeed({ _tag: "Failed", reason: error.message } satisfies OverridesReport)
  )
)
