import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import { runOxlint } from "#lib/integrations/tooling/oxlint/files.ts"

import { TrialLintFailed } from "#lib/shared/errors.ts"
import { writeFile } from "#lib/shared/filesystem.ts"
import { stringifyJson } from "#lib/shared/json.ts"

export { OxlintCommand, listLintedFiles } from "#lib/integrations/tooling/oxlint/files.ts"

/**
 * Oxlint prints a line, such as "No files found to lint.", before its JSON report.
 */
const JSON_REPORT_START = /^\{/mu

/**
 * A path in an Oxlint report, with `/` between folders. Oxlint prints the separators of the
 * platform, and the trial and the overrides compare the path with project paths that git prints.
 */
const ReportPath = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: (path) => path.replaceAll("\\", "/"),
      encode: (path) => path,
    })
  )
)

const OxlintReport = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({
      // A parse error has no rule, so it has no code.
      code: Schema.optional(Schema.String),
      filename: ReportPath,
      labels: Schema.Array(
        Schema.Struct({ span: Schema.Struct({ column: Schema.Int, line: Schema.Int }) })
      ),
      message: Schema.String,
    })
  ),
  number_of_files: Schema.Int,
})

const decodeOxlintReport = Schema.decodeUnknownOption(Schema.fromJsonString(OxlintReport))

const OxlintRules = Schema.Array(Schema.Struct({ scope: Schema.String, value: Schema.String }))

const decodeOxlintRules = Schema.decodeUnknownOption(Schema.fromJsonString(OxlintRules))

const OxlintConfig = Schema.Struct({ rules: Schema.Record(Schema.String, Schema.Unknown) })

const decodeOxlintConfig = Schema.decodeUnknownOption(Schema.fromJsonString(OxlintConfig))

/**
 * The plugin and the name of a rule. A rule without a plugin, such as `no-debugger`, belongs to
 * `eslint`, as in Oxlint.
 */
export function splitRuleName(rule: string): { readonly name: string; readonly plugin: string } {
  const separator = rule.lastIndexOf("/")

  return separator === -1
    ? { name: rule, plugin: "eslint" }
    : { name: rule.slice(separator + 1), plugin: rule.slice(0, separator) }
}

/**
 * A rule as Oxlint reports it. Oxlint resolves the name of a built-in rule, so it reports
 * `@typescript-eslint/no-explicit-any` as `typescript(no-explicit-any)`, and
 * `typescript/no-restricted-imports` as `eslint(no-restricted-imports)`. A rule of a JS plugin
 * keeps the name that the config gives it.
 */
export interface ResolvedRule {
  readonly builtIn: boolean
  readonly name: string
  readonly plugin: string
}

/**
 * Whether a diagnostic `code`, such as `eslint(no-debugger)`, comes from the rule.
 */
export function isReportOf(code: string, rule: ResolvedRule): boolean {
  return code === `${rule.plugin}(${rule.name})`
}

/**
 * The JSON report in the output of `oxlint -f json`, or none when the output has no report.
 */
export function parseOxlintReport(stdout: string) {
  const start = stdout.search(JSON_REPORT_START)

  return start === -1 ? Option.none() : decodeOxlintReport(stdout.slice(start))
}

/**
 * Lints `files` in `cwd` with Oxlint, and returns its JSON report. Oxlint finds the config of each
 * file.
 */
export const lintFiles = Effect.fn("lintFiles")(function* (cwd: string, files: readonly string[]) {
  const { output, stdout } = yield* runOxlint(cwd, ["-f", "json", ...files])
  const report = parseOxlintReport(stdout)

  if (Option.isNone(report)) {
    return yield* new TrialLintFailed({ output })
  }

  return report.value
})

/**
 * The rule as Oxlint reports it, with the Oxlint runtime of `project`. Oxlint prints the config of
 * an empty folder that turns on the rule and each built-in plugin, and names the rule as it
 * resolves it. A rule that this config cannot load is a rule of a JS plugin.
 */
export const resolveRule = Effect.fn("resolveRule")(function* (rule: string, project: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const folder = yield* fs.makeTempDirectoryScoped({ prefix: "adamantite-rules-" })
  const listed = yield* runOxlint(folder, ["--rules", "-f", "json"], project)
  const rules = decodeOxlintRules(listed.stdout)

  if (Option.isNone(rules)) {
    return yield* new TrialLintFailed({ output: listed.output })
  }

  // `--rules` and `--print-config` name a plugin with `_`, such as `jsx_a11y`, and a config and a
  // report name it with `-`.
  const plugins = Array.dedupe(rules.value.map((entry) => entry.scope.replaceAll("_", "-")))
  const { name, plugin } = splitRuleName(rule)

  yield* writeFile(
    path.join(folder, ".oxlintrc.json"),
    yield* stringifyJson({
      categories: { correctness: "off" },
      plugins,
      rules: { [rule]: "error" },
    })
  )

  const printed = yield* runOxlint(folder, ["--print-config"], project)

  const resolved = decodeOxlintConfig(printed.stdout).pipe(
    Option.flatMap((config) =>
      Array.findFirst(Object.keys(config.rules), (key) => splitRuleName(key).name === name)
    ),
    Option.map((key) => splitRuleName(key))
  )

  return Option.match(resolved, {
    onNone: (): ResolvedRule => ({ builtIn: false, name, plugin }),
    onSome: (key): ResolvedRule => ({
      builtIn: true,
      name: key.name,
      plugin: key.plugin.replaceAll("_", "-"),
    }),
  })
}, Effect.scoped)
