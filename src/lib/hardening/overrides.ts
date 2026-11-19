import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import type { ProjectPath } from "#lib/hardening/project-files.ts"
import type * as Project from "#lib/project/index.ts"
import { lintFiles, listLintedFiles, resolveRule } from "#lib/hardening/oxlint.ts"
import { makeProjectCopy, renderOverrideTrialConfig, replaceConfigs } from "#lib/hardening/trial.ts"
import { IDENTITY_KEY, readConfig } from "#lib/project/config-loader.ts"
import { checkExists } from "#lib/shared/filesystem.ts"

interface RuleOffOverride {
  readonly files: readonly string[]
  readonly index: number
  readonly rules: readonly string[]
}

const OverrideFileMark = Schema.Literals(["breaks", "clean", "ignored", "missing", "unparsable"])

type OverrideFileMark = typeof OverrideFileMark.Type

const OverriddenRule = Schema.Struct({
  config: Schema.String,
  files: Schema.Array(Schema.Struct({ file: Schema.String, mark: OverrideFileMark })),
  globs: Schema.Array(Schema.String),
  rule: Schema.String,
})

export class LintedOverrides extends Schema.TaggedClass<
  LintedOverrides,
  { readonly brand: unique symbol }
>()("Linted", {
  rules: Schema.Array(OverriddenRule),
}) {}

export class OverridesLintFailed extends Schema.TaggedClass<
  OverridesLintFailed,
  { readonly brand: unique symbol }
>()("Failed", {
  reason: Schema.String,
}) {}

export const OverridesReport = Schema.Union([LintedOverrides, OverridesLintFailed])

export type OverridesReport = typeof OverridesReport.Type

const GLOB_CHARACTERS = /[!*?[\]{}]/u

const Severity = Schema.Union([Schema.String, Schema.Finite])

const RuleSetting = Schema.Union([
  Severity,
  Schema.TupleWithRest(Schema.Tuple([Severity]), [Schema.Unknown]),
])

// A record skips each key that its key schema rejects.
const RuleName = Schema.String.check(Schema.makeFilter((key: string) => key !== IDENTITY_KEY))

const OverridesConfig = Schema.Struct({
  overrides: Schema.optional(
    Schema.Array(
      Schema.Struct({
        files: Schema.optional(Schema.Array(Schema.String)),
        rules: Schema.optional(Schema.Record(RuleName, RuleSetting)),
      })
    )
  ),
})

function isOff(setting: typeof RuleSetting.Type): boolean {
  const [severity] = Array.isArray(setting) ? setting : [setting]

  return severity === "off" || severity === "allow" || severity === 0
}

function listRuleOffOverrides({ overrides = [] }: typeof OverridesConfig.Type): RuleOffOverride[] {
  return overrides.flatMap(({ files = [], rules = {} }, index) => {
    const offRules = Object.entries(rules).flatMap(([rule, setting]) =>
      isOff(setting) ? [rule] : []
    )

    return files.length > 0 && offRules.length > 0 ? [{ files, index, rules: offRules }] : []
  })
}

export const readOverrides = Effect.fn("readOverrides")(
  function* (
    cwd: string,
    workspace: Project.Workspace,
    configs: readonly ProjectPath[],
    scope: ProjectPath | null
  ) {
    const path = yield* Path.Path

    function isInScope(file: string) {
      return scope === null || scope === "." || file === scope || file.startsWith(`${scope}/`)
    }

    function toProjectPath(config: string, file: string) {
      return path
        .relative(cwd, path.join(cwd, path.dirname(config), file))
        .split(path.sep)
        .join("/")
    }

    const found = yield* Effect.forEach(
      configs,
      (config) =>
        readConfig(cwd, path.join(cwd, config), OverridesConfig).pipe(
          Effect.map((loaded) => ({
            config,
            overrides: loaded.pipe(
              Option.flatMap(Result.getSuccess),
              Option.match({ onNone: () => [], onSome: listRuleOffOverrides })
            ),
          }))
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
        (file) => checkExists(path.join(cwd, file)),
        { concurrency: "unbounded" }
      )
    )

    const linted = entries.filter((entry) => entry.literals.some((file) => existing.has(file)))
    const marks = new Map<string, OverrideFileMark>()

    if (linted.length > 0) {
      const resolved = new Map(
        yield* Effect.forEach(
          Array.dedupe(linted.map((entry) => entry.rule)),
          (rule) =>
            resolveRule(rule, cwd).pipe(Effect.map((resolution) => [rule, resolution] as const)),
          { concurrency: "unbounded" }
        )
      )

      const copy = yield* makeProjectCopy(cwd, workspace)

      yield* replaceConfigs(
        copy,
        new Map(
          Array.dedupe(linted.map((entry) => entry.config)).map((config) => {
            const removals = new Map<number, string[]>()

            for (const entry of linted.filter((candidate) => candidate.config === config)) {
              removals.set(entry.index, [...(removals.get(entry.index) ?? []), entry.rule])
            }

            return [config, (base: string) => renderOverrideTrialConfig({ config: base, removals })]
          })
        )
      )

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
        const rule = resolved.get(entry.rule)

        for (const file of entry.literals.filter((literal) => existing.has(literal))) {
          const breaks = report.diagnostics.some(
            (diagnostic) =>
              diagnostic.filename === file
              && rule !== undefined
              && diagnostic.code === `${rule.plugin}(${rule.name})`
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

    return new LintedOverrides({
      rules: entries
        .filter((entry) => entry.literals.length > 0 || entry.globs.length > 0)
        .map((entry): typeof OverriddenRule.Type => ({
          config: entry.config,
          files: entry.literals.map((file) => ({
            file,
            mark: marks.get(`${entry.rule}\0${file}`) ?? "missing",
          })),
          globs: entry.globs,
          rule: entry.rule,
        })),
    })
  },
  Effect.scoped,
  Effect.catch((error) => Effect.succeed(new OverridesLintFailed({ reason: error.message })))
)
