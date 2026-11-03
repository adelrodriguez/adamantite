import process from "node:process"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { getOxlintCommand } from "#lib/execution/oxlint-entry.ts"
import { CliNotFound, TrialLintFailed } from "#lib/shared/errors.ts"

/**
 * Oxlint prints a line, such as "No files found to lint.", before its JSON report.
 */
const JSON_REPORT_START = /^\{/mu

const OxlintReport = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({
      // A parse error has no rule, so it has no code.
      code: Schema.optional(Schema.String),
      filename: Schema.String,
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

/**
 * A diagnostic code, such as `eslint(no-debugger)`: the plugin that reports, and the rule name.
 */
const DIAGNOSTIC_CODE = /^(?<plugin>[^()]+)\((?<name>[^()]+)\)$/u

const decodeOxlintRules = Schema.decodeUnknownOption(Schema.fromJsonString(OxlintRules))

/**
 * The command that runs Oxlint for a project. It starts the toolchain entry that the build writes
 * beside the CLI, so a test that runs from source gives the entry in `src/oxlint.ts`.
 */
export const OxlintCommand = Context.Reference<typeof getOxlintCommand>(
  "adamantite/OxlintCommand",
  {
    defaultValue: () => getOxlintCommand,
  }
)

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
 * The plugins and the rules that Oxlint has built in, as a config names them, such as `jsx-a11y`
 * and `jsx-a11y/alt-text`.
 */
export interface BuiltInRules {
  readonly plugins: ReadonlySet<string>
  readonly rules: ReadonlySet<string>
}

/**
 * Whether a diagnostic `code`, such as `eslint(no-debugger)`, comes from the rule. Oxlint reports a
 * rule under its plugin. A built-in rule that Oxlint does not list, such as
 * `typescript/no-restricted-imports`, is an alias of the rule of another built-in plugin, and
 * Oxlint reports it under that plugin, as `eslint(no-restricted-imports)`.
 */
export function isReportOf(code: string, rule: string, builtIns: BuiltInRules): boolean {
  const { name, plugin } = splitRuleName(rule)
  const reporter = DIAGNOSTIC_CODE.exec(code)?.groups

  if (reporter?.["name"] !== name) {
    return false
  }

  const reportingPlugin = reporter["plugin"] ?? ""

  return (
    reportingPlugin === plugin
    || (builtIns.plugins.has(plugin)
      && !builtIns.rules.has(`${plugin}/${name}`)
      && builtIns.plugins.has(reportingPlugin))
  )
}

/**
 * Oxlint and Oxfmt load TypeScript configs through Node, which warns about every typeless
 * `package.json` it reparses as ESM.
 */
function quietNodeOptions() {
  return [process.env["NODE_OPTIONS"], "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"]
    .filter(Boolean)
    .join(" ")
}

/**
 * Runs Oxlint in `cwd`, with the toolchain of `project`. `output` has stdout and stderr together,
 * because Oxlint prints a config error to either stream.
 */
const runOxlint = Effect.fn("runOxlint")(
  function* (cwd: string, args: readonly string[], project: string = cwd) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const command = (yield* OxlintCommand)(project)
    const handle = yield* spawner.spawn(
      ChildProcess.make(command.command, [...command.args, ...args], {
        cwd,
        env: { ...command.env, NODE_OPTIONS: quietNodeOptions() },
        extendEnv: true,
        stdin: "ignore",
      })
    )
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(handle.stdout)),
        Stream.mkString(Stream.decodeText(handle.stderr)),
        handle.exitCode,
      ],
      { concurrency: "unbounded" }
    )

    return { exitCode, output: `${stdout}${stderr}`.trim(), stdout }
  },
  Effect.scoped,
  Effect.mapError((cause) =>
    cause.reason._tag === "NotFound"
      ? new CliNotFound({ command: "node" })
      : new TrialLintFailed({ output: cause.message })
  )
)

/**
 * Lints `files` in `cwd` with Oxlint, and returns its JSON report. Oxlint finds the config of each
 * file.
 */
export const lintFiles = Effect.fn("lintFiles")(function* (cwd: string, files: readonly string[]) {
  const { output, stdout } = yield* runOxlint(cwd, ["-f", "json", ...files])
  const start = stdout.search(JSON_REPORT_START)
  const report = start === -1 ? Option.none() : decodeOxlintReport(stdout.slice(start))

  if (Option.isNone(report)) {
    return yield* new TrialLintFailed({ output })
  }

  return report.value
})

/**
 * The files that Oxlint lints in `cwd`, relative to `cwd` with `/` between folders: the given
 * `files`, or all files when none are given, without the files that an ignore pattern or
 * `.gitignore` matches.
 */
export const listLintedFiles = Effect.fn("listLintedFiles")(function* (
  cwd: string,
  files: readonly string[] = []
) {
  const { exitCode, output, stdout } = yield* runOxlint(cwd, ["--debug=files", ...files])

  if (exitCode !== 0) {
    return yield* new TrialLintFailed({ output })
  }

  return stdout
    .split("\n")
    .map((line) => line.trim().replaceAll("\\", "/"))
    .filter((line) => line.length > 0)
})

/**
 * The plugins and the rules that Oxlint has built in, with the toolchain of `project`. Oxlint runs
 * in an empty folder, so no config loads.
 */
export const listBuiltInRules = Effect.fn("listBuiltInRules")(function* (project: string) {
  const fs = yield* FileSystem.FileSystem
  const folder = yield* fs.makeTempDirectoryScoped({ prefix: "adamantite-rules-" })
  const { output, stdout } = yield* runOxlint(folder, ["--rules", "-f", "json"], project)
  const rules = decodeOxlintRules(stdout)

  if (Option.isNone(rules)) {
    return yield* new TrialLintFailed({ output })
  }

  // `--rules` names a plugin with `_`, such as `jsx_a11y`, and a config names it with `-`.
  const named = rules.value.map(({ scope, value }) => ({
    plugin: scope.replaceAll("_", "-"),
    value,
  }))

  return {
    plugins: new Set(named.map((rule) => rule.plugin)),
    rules: new Set(named.map((rule) => `${rule.plugin}/${rule.value}`)),
  } satisfies BuiltInRules
}, Effect.scoped)
