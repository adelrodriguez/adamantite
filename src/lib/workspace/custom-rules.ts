import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { CustomRuleExists, FailedToReadFile, InvalidRuleName } from "#lib/shared/errors.ts"
import { ensureDirectory, writeFile } from "#lib/shared/filesystem.ts"

/**
 * The rules folder that `custom()` loads when no `dir` is given, relative to the file that calls
 * it.
 */
export const CUSTOM_RULES_DIRECTORY = ".adamantite/rules"

export const CUSTOM_RULES_AGENTS_FILE = "AGENTS.md"

const RULE_NAME_PATTERN = /^[a-z][\da-z]*(?:-[\da-z]+)*$/

// Keep this text the same as the "Custom rules" section of skills/adamantite/SKILL.md.
export const CUSTOM_RULES_AGENTS_CONTENT = `# Custom rules

Each file in the rules folder, \`.adamantite/rules/\` by default, is an Oxlint rule that this
project owns. \`custom()\` from \`adamantite/lint/custom\` loads the folder and enables each
rule as \`error\` under the \`project\` plugin: \`no-process-env.ts\` becomes
\`project/no-process-env\`. Add a file to add a rule. Delete the file to remove the rule.
\`adamantite rule add <name>\` writes a correct stub.

- A file that starts with \`_\`, such as \`_helpers.ts\`, is a helper, not a rule. Subfolders are
  not read.
- Export the rule as default with \`defineRule\` from \`adamantite/rules\`. The same module exports
  the \`Context\`, \`Rule\`, \`Visitor\`, and \`ESTree\` node types.
- Use \`createOnce\`. It runs one time for each lint run, not one time for each file. Reset
  per-file state in \`before\`, and report collected results in \`after\`. \`context.filename\`,
  \`context.sourceCode\`, and \`context.settings\` are not available in the body of
  \`createOnce\`. Read them in \`before\` or in a visitor.
- Write erasable TypeScript only. Oxlint loads rule files with Node.js type stripping, so
  \`enum\`, a \`namespace\` with values, parameter properties, and \`import x = require()\` stop
  the lint run.
- Rules get no type information. Use only the AST and \`context.sourceCode\`.
- Report with a \`messageId\`, and put each message in \`meta.messages\`. Describe the options in
  \`meta.schema\`, and read them from \`context.options\`.
- A rule that throws prints an error for each file, and the lint run still exits 0. After you
  change a rule, run the lint and read all of its output.
- To find node names, run \`adamantite rule ast <file>\` on real code. It prints the same
  ESTree-shaped AST that rules visit.
- To test a rule, use \`RuleTester\` from \`oxlint/plugins-dev\`. Adamantite does not run rule
  tests.
- Oxlint caches the rules for each run. Restart the editor language server after you change a
  rule.
- TypeScript does not check \`.adamantite/rules/\` by default, because its name starts with a dot. Add
  \`".adamantite/rules"\` to \`include\` in \`tsconfig.json\` to check it.
- In a monorepo, give each rules folder its own plugin name, such as \`custom({ name: "web" })\`:
  Oxlint rejects two plugins with the same name in one run. A relative \`dir\` resolves from the
  file that calls \`custom()\`, so a shared tooling package can own the rules with
  \`custom({ dir: "rules", name: "acme" })\`. A nested Oxlint config replaces the root config, so
  a package that needs the root rules extends the root config.
`

/**
 * The stub that `adamantite rule add` writes: a working rule that the author replaces.
 */
export function toCustomRuleStub(name: string): string {
  return `import { defineRule } from "adamantite/rules"

export default defineRule({
  meta: {
    docs: { description: "TODO: describe what ${name} reports." },
    messages: { unexpected: "TODO: tell the author what to do instead." },
    schema: [],
    type: "problem",
  },
  createOnce(context) {
    return {
      // Run \`adamantite rule ast <file>\` to find the node types to visit.
      DebuggerStatement(node) {
        context.report({ messageId: "unexpected", node })
      },
    }
  },
})
`
}

interface AddedCustomRule {
  /**
   * Undefined when the rules folder already had an `AGENTS.md`.
   */
  readonly agentsPath: string | undefined
  readonly rulePath: string
}

/**
 * Write a rule stub to the rules folder, and the authoring guidance when the folder has none. A
 * relative `dir` resolves from `cwd`.
 */
export const addCustomRule = Effect.fn("addCustomRule")(function* (
  cwd: string,
  name: string,
  dir: string = CUSTOM_RULES_DIRECTORY
) {
  if (!RULE_NAME_PATTERN.test(name)) {
    return yield* new InvalidRuleName({ name })
  }

  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = path.resolve(cwd, dir)
  const rulePath = path.join(directory, `${name}.ts`)
  const agentsPath = path.join(directory, CUSTOM_RULES_AGENTS_FILE)
  const exists = (target: string) =>
    fs
      .exists(target)
      .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: target })))

  if (yield* exists(rulePath)) {
    return yield* new CustomRuleExists({ path: rulePath })
  }

  yield* ensureDirectory(directory)
  yield* writeFile(rulePath, toCustomRuleStub(name))

  if (yield* exists(agentsPath)) {
    return { agentsPath: undefined, rulePath } satisfies AddedCustomRule
  }

  yield* writeFile(agentsPath, CUSTOM_RULES_AGENTS_CONTENT)

  return { agentsPath, rulePath } satisfies AddedCustomRule
})
