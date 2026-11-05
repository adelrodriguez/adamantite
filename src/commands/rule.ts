import process from "node:process"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import { parseSync } from "oxc-parser"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import {
  parseTrialCase,
  type TrialCaseResult,
  type TrialSetting,
  tryRule,
} from "#lib/hardening/trial.ts"
import { CommandFailed, FailedToParseSource, InvalidTrialOptions } from "#lib/shared/errors.ts"
import { readFile } from "#lib/shared/filesystem.ts"
import { formatJson } from "#lib/shared/json.ts"
import {
  addCustomRule,
  CUSTOM_RULES_DIRECTORY,
  readCustomRuleTestCommand,
} from "#lib/workspace/custom-rules/index.ts"
import { readProject } from "#lib/workspace/project.ts"
import { Prompter } from "#terminal/prompter.ts"

const astFile = Argument.File("file", { mustExist: true }).pipe(
  Argument.withDescription("The JavaScript or TypeScript file to parse")
)

const ast = Command.make("ast", { file: astFile }).pipe(
  Command.withDescription(
    "Print the ESTree-shaped AST that Oxlint rules visit, to find node names for a custom rule"
  ),
  Command.withHandler(({ file }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const content = yield* readFile(file)
      // Oxlint gives rules an AST without parenthesized expressions.
      const result = parseSync(file, content, { preserveParens: false })

      if (result.errors.length > 0) {
        return yield* new FailedToParseSource({
          errors: result.errors.map((error) => error.message),
          path: file,
        })
      }

      yield* prompter.message(yield* formatJson(result.program))
    })
  )
)

const ruleName = Argument.String("name").pipe(
  Argument.withDescription("The rule name in kebab-case, such as no-process-env")
)

const dir = Flag.String("dir").pipe(
  Flag.optional,
  Flag.withDescription(
    `The rules folder, relative to the current directory. Default: ${CUSTOM_RULES_DIRECTORY}. Pass the folder that \`custom({ dir })\` loads, such as a rules folder in a monorepo tooling package`
  )
)

const add = Command.make("add", { dir, name: ruleName }).pipe(
  Command.withDescription(
    "Write a custom rule stub and its test. The Adamantite skill has the authoring guidance"
  ),
  Command.withHandler(({ dir, name }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const path = yield* Path.Path
      const cwd = process.cwd()
      const { rulePath, testPath } = yield* addCustomRule(cwd, name, Option.getOrUndefined(dir))

      yield* prompter.log.success(
        `Wrote ${path.relative(cwd, rulePath)} and ${path.relative(cwd, testPath)}.`
      )
      yield* prompter.log.info("Run the test with `adamantite rule test`.")
      yield* prompter.log.info(
        '`custom()` from `adamantite/lint/custom` loads the rule. Run `adamantite doctor` to check the wiring. The "Custom rules" section of the Adamantite skill tells you how to write the rule and its test.'
      )
    })
  )
)

const test = Command.make("test").pipe(
  Command.withDescription(
    "Run the tests of the custom rules with `node --test`. `rule add` writes a test with each rule"
  ),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const path = yield* Path.Path
      const runner = yield* CommandRunner
      const cwd = process.cwd()
      const { command, unresolvedCalls, unresolvedImports } = yield* readCustomRuleTestCommand(
        yield* readProject(cwd)
      )

      for (const source of unresolvedCalls) {
        yield* prompter.log.warning(
          `\`rule test\` cannot read the \`dir\` of a \`custom()\` call in \`${path.relative(cwd, source)}\`, because it is not a string literal. It does not run the tests of that rules folder.`
        )
      }

      for (const { from, specifier } of unresolvedImports) {
        yield* prompter.log.warning(
          `\`rule test\` cannot resolve the import of \`${specifier}\` in \`${path.relative(cwd, from)}\`, so it does not run the tests of the rules folders behind it.`
        )
      }

      if (Option.isNone(command)) {
        return yield* prompter.log.info(
          "No custom rule tests found. `adamantite rule add <name>` writes a rule and its test."
        )
      }

      yield* runner.run({ ...command.value, title: "🧪 Testing custom rules" })
    })
  )
)

const trialRule = Argument.String("rule").pipe(
  Argument.withDescription(
    "The full rule name, such as no-restricted-imports, typescript/no-explicit-any, or project/no-foo"
  )
)

const report = Flag.String("report").pipe(
  Flag.atLeast(1),
  Flag.withDescription(
    "A case that has the mistake, so the rule must report it: a project path, or <path>=<file> to lint the content of <file> at <path>. Repeat the flag for more cases"
  )
)

const accept = Flag.String("accept").pipe(
  Flag.atLeast(0),
  Flag.withDescription(
    "A case that is correct code, so the rule must not report it, in the same form as --report"
  )
)

const trialOptions = Flag.String("options").pipe(
  Flag.withSchema(Schema.fromJsonString(Schema.Array(Schema.Json))),
  Flag.optional,
  Flag.withDescription(
    'The rule options that come after the severity, as a JSON array, such as \'[{"paths":["node:fs"]}]\'. The trial sets the rule to error'
  )
)

const current = Flag.Boolean("current").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Keep the rule setting of the project config, to see what it reports now")
)

function describeSetting(rule: string, setting: TrialSetting) {
  return setting._tag === "Current"
    ? `\`${rule}\` as the project config sets it`
    : `\`${rule}\` at ${JSON.stringify(["error", ...setting.options])}`
}

function isAsExpected(result: TrialCaseResult) {
  return result.diagnostics.length > 0 === (result.case.expected === "reported")
}

/**
 * The verdict of a trial: one line for each case, with the reports of the rule below it.
 */
export function renderTrial(
  rule: string,
  setting: TrialSetting,
  results: readonly TrialCaseResult[]
): string {
  const configs = [...new Set(results.map((result) => `\`${result.config}\``))].join(", ")
  const lines = results.map((result) => {
    const name = Option.match(result.case.source, {
      onNone: () => `\`${result.case.path}\``,
      onSome: (source) => `\`${result.case.path}\` from \`${source}\``,
    })
    const outcome = result.diagnostics.length > 0 ? "reported" : "accepted"
    const verdict = isAsExpected(result)
      ? `✓ ${name}: ${outcome}, as expected.`
      : `✗ ${name}: ${outcome}, but it must be ${result.case.expected}.`

    return [
      verdict,
      ...result.diagnostics.map(
        (diagnostic) => `    ${diagnostic.line}:${diagnostic.column}  ${diagnostic.message}`
      ),
    ].join("\n")
  })
  const failures = results.filter((result) => !isAsExpected(result)).length
  const summary =
    failures === 0
      ? "Each case is as expected."
      : results.length === 1
        ? "The case is not as expected."
        : `${failures} of ${results.length} cases ${failures === 1 ? "is" : "are"} not as expected.`

  return [
    `Trial of ${describeSetting(rule, setting)}, in ${configs}.`,
    "",
    ...lines,
    "",
    summary,
  ].join("\n")
}

const trial = Command.make("try", {
  accept,
  current,
  options: trialOptions,
  report,
  rule: trialRule,
}).pipe(
  Command.withDescription(
    "Lint cases in a copy of the project with one rule setting, and show whether the rule reports each case. The project stays unchanged. Exit code 0: each case is as expected. 1: a case is not. 2: the trial is not evidence"
  ),
  Command.withHandler(({ accept, current, options, report, rule }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      if (current && Option.isSome(options)) {
        return yield* new InvalidTrialOptions({
          reason: "Give `--options` or `--current`, not both.",
        })
      }

      const cases = yield* Effect.all([
        ...report.map((value) => parseTrialCase(value, "reported")),
        ...accept.map((value) => parseTrialCase(value, "accepted")),
      ])
      const setting: TrialSetting = current
        ? { _tag: "Current" }
        : { _tag: "Error", options: Option.getOrElse(options, () => []) }
      const results = yield* tryRule({ cases, cwd: process.cwd(), rule, setting }).pipe(
        Effect.catchTag(
          [
            "TrialCaseIgnored",
            "TrialCaseUnparsable",
            "TrialConfigNotFound",
            "TrialLintFailed",
            "TrialProjectUnlisted",
            "TrialRuleNotFound",
          ],
          (error) =>
            prompter.log.error(error.message).pipe(
              Effect.andThen(
                Effect.fail(
                  new CommandFailed({
                    command: "rule try",
                    exitCode: ChildProcessSpawner.ExitCode(2),
                  })
                )
              )
            )
        )
      )

      yield* prompter.message(renderTrial(rule, setting, results))

      if (!results.every((result) => isAsExpected(result))) {
        return yield* new CommandFailed({
          command: "rule try",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }
    })
  )
)

export default Command.make("rule").pipe(
  Command.withDescription("Write, inspect, and test custom Oxlint rules"),
  Command.withSubcommands([add, ast, test, trial])
)
