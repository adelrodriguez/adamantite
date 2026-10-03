import process from "node:process"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { parseSync } from "oxc-parser"
import { FailedToParseSource } from "#lib/shared/errors.ts"
import { readFile } from "#lib/shared/filesystem.ts"
import { addCustomRule, CUSTOM_RULES_DIRECTORY } from "#lib/workspace/custom-rules.ts"
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
    "Write a custom rule stub, and the authoring guidance when the rules folder has none"
  ),
  Command.withHandler(({ dir, name }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const path = yield* Path.Path
      const cwd = process.cwd()
      const added = yield* addCustomRule(cwd, name, Option.getOrUndefined(dir))

      yield* prompter.log.success(`Wrote ${path.relative(cwd, added.rulePath)}.`)

      if (added.agentsPath !== undefined) {
        yield* prompter.log.success(`Wrote ${path.relative(cwd, added.agentsPath)}.`)
      }

      yield* prompter.log.info(
        "`custom()` from `adamantite/lint/custom` loads the rule. Run `adamantite doctor` to check the wiring."
      )
    })
  )
)

export default Command.make("rule").pipe(
  Command.withDescription("Write and inspect custom Oxlint rules"),
  Command.withSubcommands([add, ast])
)
