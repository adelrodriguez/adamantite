import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import type { ProjectPath } from "#lib/hardening/project-files.ts"
import { listLintedFiles } from "#lib/integrations/tooling/oxlint/files.ts"
import { readFileIfFile } from "#lib/shared/filesystem.ts"
import { findSuppressions, SOURCE_FILE } from "#lib/workspace/suppressions.ts"

/**
 * The comments that turn off one rule, or all rules.
 */
export interface RuleSuppressions {
  /**
   * Each comment as `<file>:<line>`, with the file relative to the project root.
   */
  readonly locations: readonly string[]
  /**
   * The rule, or none for a comment that names no rule and so turns off all rules.
   */
  readonly rule: Option.Option<string>
}

/**
 * Counts the disable comments of each rule in the files that Oxlint lints in `scope`, a folder
 * relative to `cwd`, or in the whole project when `scope` is `null`. A comment in a file that the
 * config ignores turns nothing off, so it does not count. The rule with the most comments comes
 * first. None when Oxlint cannot list its files.
 */
export const readSuppressions = Effect.fn("readSuppressions")(function* (
  cwd: string,
  scope: ProjectPath | null
) {
  const path = yield* Path.Path
  const files = yield* listLintedFiles(cwd).pipe(Effect.option)

  const isInScope = (file: string) =>
    scope === null || scope === "." || file.startsWith(`${scope}/`)

  return yield* Effect.transposeOption(
    files.pipe(
      Option.map((listed) =>
        Effect.gen(function* () {
          const found = yield* Effect.forEach(
            listed.filter((file) => SOURCE_FILE.test(file) && isInScope(file)),
            (file) =>
              readFileIfFile(path.join(cwd, file)).pipe(
                Effect.map((content) =>
                  Option.match(content, {
                    onNone: () => [],
                    // Most files have no disable comment, so only those files are parsed.
                    onSome: (text) =>
                      text.includes("-disable")
                        ? findSuppressions(file, text).flatMap(({ line, rules }) =>
                            // A comment that names no rule turns off all rules.
                            (rules.length === 0 ? [undefined] : rules).map((rule) => ({
                              location: `${file}:${line}`,
                              rule: Option.fromUndefinedOr(rule),
                            }))
                          )
                        : [],
                  })
                )
              ),
            { concurrency: 16 }
          )

          const byRule = Array.groupBy(found.flat(), (entry) =>
            Option.getOrElse(entry.rule, () => "")
          )

          return Array.sort(
            Object.values(byRule).map((entries): RuleSuppressions => ({
              locations: entries.map((entry) => entry.location),
              rule: entries[0].rule,
            })),
            Order.combine(
              Order.mapInput(
                Order.flip(Order.Number),
                (entry: RuleSuppressions) => entry.locations.length
              ),
              Order.mapInput(Order.String, (entry: RuleSuppressions) =>
                Option.getOrElse(entry.rule, () => "")
              )
            )
          )
        })
      )
    )
  )
})
