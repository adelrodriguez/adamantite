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
  CurrentSetting,
  ErrorSetting,
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
  addCustomRuleTest,
  CUSTOM_RULES_DIRECTORY,
  listCustomRules,
  readCustomRuleTestCommand,
} from "#lib/workspace/custom-rules/index.ts"
import { readWorkspace } from "#lib/workspace/monorepo.ts"
import { readProject } from "#lib/workspace/project.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { Prompter } from "#terminal/prompter.ts"

const astFile = Argument.File("file", { mustExist: true }).pipe(
  Argument.withDescription("The JavaScript or TypeScript file to parse")
)

const ast = Command.make("ast", { file: astFile }).pipe(
  Command.withDescription(
    "Print the syntax tree Oxlint rules use, with node names for custom rules"
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

const testPath = Flag.String("path").pipe(
  Flag.optional,
  Flag.withDescription("The test file path, relative to the current directory")
)

const addCommand = Command.make("add", { name: ruleName }).pipe(Command.withSharedFlags({ dir }))

const addTest = Command.make("test", {
  name: ruleName.pipe(Argument.optional),
  path: testPath,
}).pipe(
  Command.withDescription("Create a test for an existing rule. Omit the name to choose a rule"),
  Command.withHandler(({ name, path: target }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const path = yield* Path.Path
      const terminal = yield* TerminalCapabilities
      const { dir } = yield* addCommand
      const directory = Option.getOrElse(dir, () => CUSTOM_RULES_DIRECTORY)
      const cwd = process.cwd()
      let selected = Option.getOrUndefined(name)

      if (selected === undefined) {
        const rules = yield* listCustomRules(cwd, directory)
        const names = rules.map((file) => file.slice(0, -path.extname(file).length))

        if (names.length === 0) {
          return yield* prompter.log.info(
            `No custom rules were found in \`${directory}\`. Run \`adamantite rule add <name>\` first.`
          )
        }

        if (!(yield* terminal.isInteractive)) {
          yield* prompter.message(names.join("\n"))

          return yield* prompter.log.info(
            "Pass a rule name with `adamantite rule add test <name>`."
          )
        }

        selected = yield* prompter.select({
          message: "Which rule needs a test?",
          options: names.map((value) => ({ label: value, value })),
        })
      }

      const written = yield* addCustomRuleTest(
        cwd,
        selected,
        directory,
        Option.getOrUndefined(target)
      )

      yield* prompter.log.success(`Wrote ${path.relative(cwd, written)}.`)
      yield* prompter.log.info(
        `Adapt the valid and invalid cases to the rule, then run \`adamantite rule test\`${Option.isSome(target) ? " with `--path` and the test file path." : "."}`
      )
      yield* prompter.log.info(
        "RuleTester uses node:test. Exclude this test from Vitest and Jest discovery. See Custom rules in the Adamantite README."
      )
    })
  )
)

const add = addCommand.pipe(
  Command.withDescription(
    "Create a custom rule file. See the Adamantite skill for authoring instructions"
  ),
  Command.withHandler(({ dir, name }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const path = yield* Path.Path
      const cwd = process.cwd()
      const rulePath = yield* addCustomRule(cwd, name, Option.getOrUndefined(dir))

      yield* prompter.log.success(`Wrote ${path.relative(cwd, rulePath)}.`)
      yield* prompter.log.info(
        '`custom()` from `adamantite/rules` loads the rule. Run `adamantite doctor` to check the wiring. The "Custom rules" section of the Adamantite skill tells agents how to verify the rule with temporary cases.'
      )
    })
  ),
  Command.withSubcommands([addTest])
)

const test = Command.make("test", { path: testPath }).pipe(
  Command.withDescription(
    "Run custom rule tests with node --test. Use --path for a test outside the rules folder"
  ),
  Command.withHandler(({ path: target }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const path = yield* Path.Path
      const runner = yield* CommandRunner
      const cwd = process.cwd()

      if (Option.isSome(target)) {
        return yield* runner.run({
          args: ["--test", path.resolve(cwd, target.value)],
          command: "node",
          title: "🧪 Testing custom rules",
        })
      }

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
          "No tests were found for loaded custom rules. Run `adamantite doctor` to check rule setup, or `adamantite rule add test` to add a test."
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
    "Add a case the rule must report. Use a project path, or <path>=<file> to lint file contents at another path. Repeat --report for more cases"
  )
)

const accept = Flag.String("accept").pipe(
  Flag.atLeast(0),
  Flag.withDescription("Add a case the rule must accept, using the same path format as --report")
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
  Flag.withDescription("Use the project's current rule setting to see what it reports")
)

function describeSetting(rule: string, setting: TrialSetting) {
  return setting instanceof CurrentSetting
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
      ? "All cases produced the expected result."
      : results.length === 1
        ? "The case did not produce the expected result."
        : `${failures.toLocaleString("en-US")} of ${results.length.toLocaleString("en-US")} cases ${failures === 1 ? "is" : "are"} different from the expected result.`

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
    "Test a rule against cases in a project copy. Exit codes: 0 for expected results, 1 for a mismatch, and 2 if a case could not be checked. Project files stay unchanged"
  ),
  Command.withHandler(({ accept, current, options, report, rule }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      const setting = current
        ? new CurrentSetting()
        : new ErrorSetting({ options: Option.getOrElse(options, () => []) })

      const results = yield* Effect.gen(function* () {
        if (current && Option.isSome(options)) {
          return yield* new InvalidTrialOptions({
            reason: "Give `--options` or `--current`, not both.",
          })
        }

        const cases = yield* Effect.all([
          ...report.map((value) => parseTrialCase(value, "reported")),
          ...accept.map((value) => parseTrialCase(value, "accepted")),
        ])

        const cwd = process.cwd()

        return yield* tryRule({ cases, cwd, rule, setting, workspace: yield* readWorkspace(cwd) })
      }).pipe(
        // Exit code 1 means that a case differs. A failure before the verdict checked no case, so
        // every failure here exits with 2.
        Effect.catch((error) =>
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
  Command.withDescription(
    "Create and inspect custom Oxlint rules, try them against cases, and run saved tests"
  ),
  Command.withSubcommands([add, ast, test, trial])
)
