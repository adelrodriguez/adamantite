import process from "node:process"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { parseSync } from "oxc-parser"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { FailedToParseSource } from "#lib/shared/errors.ts"
import { readFile } from "#lib/shared/filesystem.ts"
import {
  addCustomRule,
  CUSTOM_RULES_DIRECTORY,
  readCustomRuleTestCommand,
} from "#lib/workspace/custom-rules/index.ts"
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

      yield* prompter.message(JSON.stringify(result.program, null, 2))
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
      const { command, unresolvedCalls, unresolvedImports } = yield* readCustomRuleTestCommand(cwd)

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

export default Command.make("rule").pipe(
  Command.withDescription("Write, inspect, and test custom Oxlint rules"),
  Command.withSubcommands([add, ast, test])
)
