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

const RULE_NAME_PATTERN = /^[a-z][\da-z]*(?:-[\da-z]+)*$/

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

/**
 * Write a rule stub to the rules folder. A relative `dir` resolves from `cwd`.
 */
export const addCustomRule = Effect.fn("addCustomRule")(function* (
  cwd: string,
  name: string,
  dir: string = CUSTOM_RULES_DIRECTORY
) {
  if (!RULE_NAME_PATTERN.test(name)) {
    return yield* new InvalidRuleName({ rule: name })
  }

  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = path.resolve(cwd, dir)
  const rulePath = path.join(directory, `${name}.ts`)
  const exists = yield* fs
    .exists(rulePath)
    .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: rulePath })))

  if (exists) {
    return yield* new CustomRuleExists({ path: rulePath })
  }

  yield* ensureDirectory(directory)
  yield* writeFile(rulePath, toCustomRuleStub(name))

  return rulePath
})
