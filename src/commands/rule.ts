import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Prompt from "effect/cli/Prompt"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as Bridge from "#lib/bridge/index.ts"
import {
  CurrentSetting,
  ErrorSetting,
  parseTrialCase,
  TrialCaseResult,
  TrialSetting,
  tryRule,
} from "#lib/hardening/trial.ts"
import {
  addCustomRule,
  addCustomRuleTest,
  listCustomRules,
  readCustomRuleTestCommand,
} from "#lib/project/custom-rules/index.ts"
import * as Project from "#lib/project/index.ts"
import { CommandRunner } from "#lib/shared/command-runner.ts"
import { CommandFailed, InvalidTrialOptions } from "#lib/shared/errors.ts"
import { formatJson } from "#lib/shared/json.ts"
import { CUSTOM_RULES_SECTION, HARDENING_SKILL } from "#lib/shared/skill.ts"
import { DEFAULT_DIRECTORY } from "#presets/rules/folder.ts"
import * as Mode from "#terminal/mode.ts"
import * as Output from "#terminal/output.ts"

const astFile = Argument.File("file", { mustExist: true }).pipe(
  Argument.withDescription("The JavaScript or TypeScript file to parse")
)

/**
 * What `rule ast --json` prints: the file, relative to the current directory, and its syntax tree
 * in the ESTree shape that Oxlint gives rules.
 */
export const AstReport = Schema.Struct({
  file: Schema.String,
  program: Schema.Unknown,
  schemaVersion: Schema.Literal(1),
})

const ast = Command.make("ast", { file: astFile, json: Mode.json }).pipe(
  Command.withDescription(
    "Print the syntax tree Oxlint rules use, with node names for custom rules"
  ),
  Command.withHandler(({ file, json }) =>
    Effect.gen(function* () {
      const cwd = yield* Project.Directory
      const path = yield* Path.Path
      const relative = path.relative(cwd, path.resolve(cwd, file))
      const program = yield* Bridge.ast(relative)

      yield* Output.result(
        AstReport,
        { file: relative, program, schemaVersion: 1 },
        yield* formatJson(program)
      )
    }).pipe(Mode.provide({ json }))
  )
)

const ruleName = Argument.String("name").pipe(
  Argument.withDescription("The rule name in kebab-case, such as no-process-env")
)

const dir = Flag.String("dir").pipe(
  Flag.optional,
  Flag.withDescription(
    `The rules folder, relative to the current directory. Default: ${DEFAULT_DIRECTORY}. Pass the folder that \`custom({ dir })\` loads, such as a rules folder in a monorepo tooling package`
  )
)

const testPath = Flag.String("path").pipe(
  Flag.optional,
  Flag.withDescription("The test file path, relative to the current directory")
)

const add = Command.make("add", { dir, name: ruleName }).pipe(
  Command.withDescription(
    `Create a custom rule file. See the ${HARDENING_SKILL} skill for authoring instructions`
  ),
  Command.withHandler(({ dir, name }) =>
    Effect.gen(function* () {
      const cwd = yield* Project.Directory
      const path = yield* Path.Path
      const rulePath = yield* addCustomRule(cwd, name, Option.getOrUndefined(dir))

      yield* Output.success(`Wrote ${path.relative(cwd, rulePath)}.`)
      yield* Output.info(
        `\`custom()\` from \`adamantite/rules\` loads the rule. Run \`adamantite doctor\` to check the wiring. The "${CUSTOM_RULES_SECTION}" section of the \`${HARDENING_SKILL}\` skill tells agents how to verify the rule with temporary cases.`
      )
    })
  )
)

const addTest = Command.make("add", {
  dir,
  name: ruleName.pipe(Argument.optional),
  path: testPath,
}).pipe(
  Command.withDescription("Create a test for an existing rule. Omit the name to choose a rule"),
  Command.withHandler(({ dir, name, path: target }) =>
    Effect.gen(function* () {
      const cwd = yield* Project.Directory
      const path = yield* Path.Path
      const directory = Option.getOrElse(dir, () => DEFAULT_DIRECTORY)
      let selected = Option.getOrUndefined(name)

      if (selected === undefined) {
        const rules = yield* listCustomRules(cwd, directory)
        const names = rules.map((file) => file.slice(0, -path.extname(file).length))

        if (names.length === 0) {
          return yield* Output.info(
            `No custom rules were found in \`${directory}\`. Run \`adamantite rule add <name>\` first.`
          )
        }

        const { canPrompt } = yield* TerminalCapabilities.TerminalCapabilities

        if (!canPrompt) {
          yield* Console.log(names.join("\n"))

          return yield* Output.info("Pass a rule name with `adamantite rule test add <name>`.")
        }

        selected = yield* Prompt.Select({
          choices: names.map((value) => ({ title: value, value })),
          message: "Which rule needs a test?",
        })
      }

      const written = yield* addCustomRuleTest(
        cwd,
        selected,
        directory,
        Option.getOrUndefined(target)
      )

      yield* Output.success(`Wrote ${path.relative(cwd, written)}.`)
      yield* Output.info(
        `Adapt the valid and invalid cases to the rule, then run \`adamantite rule test\`${Option.isSome(target) ? " with `--path` and the test file path." : "."}`
      )
      yield* Output.info(
        "RuleTester uses node:test. Exclude this test from Vitest and Jest discovery. See Custom rules in the Adamantite README."
      )
    }).pipe(
      Effect.catchTag("QuitError", () =>
        Output.cancel("No rule test was added.").pipe(
          Effect.andThen(
            new CommandFailed({
              command: "rule test add",
              exitCode: ChildProcessSpawner.ExitCode(1),
            })
          )
        )
      )
    )
  )
)

const test = Command.make("test", { path: testPath }).pipe(
  Command.withDescription(
    "Run custom rule tests with node --test. Use --path for a test outside the rules folder"
  ),
  Command.withHandler(({ path: target }) =>
    Effect.gen(function* () {
      const cwd = yield* Project.Directory
      const path = yield* Path.Path
      const runner = yield* CommandRunner

      if (Option.isSome(target)) {
        return yield* runner.run({
          args: ["--test", path.resolve(cwd, target.value)],
          command: "node",
          title: "🧪 Testing custom rules",
        })
      }

      const { command, unloadedConfigs } = yield* readCustomRuleTestCommand(yield* Project.read())

      for (const { file, reason } of unloadedConfigs) {
        yield* Output.warning(
          `\`rule test\` cannot load \`${path.relative(cwd, file)}\`, so it does not run the tests of the rules folders behind it. Node.js reported: ${reason}`
        )
      }

      if (Option.isNone(command)) {
        return yield* Output.info(
          "No tests were found for loaded custom rules. Run `adamantite doctor` to check rule setup, or `adamantite rule test add` to add a test."
        )
      }

      yield* runner.run({ ...command.value, title: "🧪 Testing custom rules" })
    })
  ),
  Command.withSubcommands([addTest])
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

  const described = Schema.is(CurrentSetting)(setting)
    ? `\`${rule}\` as the project config sets it`
    : `\`${rule}\` at ${JSON.stringify(["error", ...setting.options])}`

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

  return [`Trial of ${described}, in ${configs}.`, "", ...lines, "", summary].join("\n")
}

/**
 * What `rule try --json` prints: the rule, the setting of the trial, and what the rule reported on
 * each case.
 */
export const TrialReport = Schema.Struct({
  results: Schema.Array(TrialCaseResult),
  rule: Schema.String,
  schemaVersion: Schema.Literal(1),
  setting: TrialSetting,
})

const trial = Command.make("try", {
  accept,
  current,
  json: Mode.json,
  options: trialOptions,
  report,
  rule: trialRule,
}).pipe(
  Command.withDescription(
    "Test a rule against cases in a project copy. Exit codes: 0 for expected results, 1 for a mismatch, and 2 if a case could not be checked. Project files stay unchanged"
  ),
  Command.withHandler(({ json, ...flags }) =>
    Effect.gen(function* () {
      const cwd = yield* Project.Directory
      const { accept, current, options, report, rule } = flags

      const setting = current
        ? new CurrentSetting()
        : new ErrorSetting({ options: Option.getOrElse(options, () => []) })

      const results = yield* Effect.gen(function* () {
        if (current && Option.isSome(options)) {
          return yield* new InvalidTrialOptions({
            reason: "Give `--options` or `--current`, not both.",
          })
        }

        const cases = yield* Effect.all(
          [
            ...report.map((value) => parseTrialCase(value, "reported")),
            ...accept.map((value) => parseTrialCase(value, "accepted")),
          ],
          { concurrency: 1 }
        )

        return yield* tryRule({
          cases,
          cwd,
          rule,
          setting,
          workspace: yield* Project.readWorkspace(),
        })
      }).pipe(
        // Exit code 1 means that a case differs. A failure before the verdict checked no case, so
        // every failure here exits with 2.
        Effect.catch((error) =>
          Output.error(error.message).pipe(
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

      yield* Output.result(
        TrialReport,
        { results, rule, schemaVersion: 1, setting },
        renderTrial(rule, setting, results)
      )

      if (!results.every((result) => isAsExpected(result))) {
        return yield* new CommandFailed({
          command: "rule try",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }
    }).pipe(Mode.provide({ json }))
  )
)

export default Command.make("rule").pipe(
  Command.withDescription(
    "Create and inspect custom Oxlint rules, try them against cases, and run saved tests"
  ),
  Command.withSubcommands([add, ast, test, trial])
)
