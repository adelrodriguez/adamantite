import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import { parseSync, Visitor } from "oxc-parser"
import type { Finding } from "#lib/integrations/base.ts"
import type { Project } from "#lib/workspace/project.ts"
import { listLintedFiles } from "#lib/integrations/tooling/oxlint/files.ts"
import { RETIRED_RULE_NAMESPACES } from "#lib/integrations/tooling/oxlint/presets.ts"
import { readFileIfFile } from "#lib/shared/filesystem.ts"
import { findSuppressions, SOURCE_FILE } from "#lib/workspace/suppressions.ts"

function replacement(rule: string) {
  for (const [old, current] of Object.entries(RETIRED_RULE_NAMESPACES)) {
    if (rule.startsWith(`${old}/`)) {
      return `${current}${rule.slice(old.length)}`
    }
  }

  return undefined
}

/**
 * Old rule keys in top-level or override rule objects, without loading project code.
 */
export function findRetiredRules(file: string, content: string) {
  const parsed = parseSync(file, content)
  const entries: Array<{ readonly line: number; readonly rule: string }> = []

  if (parsed.errors.length > 0) {
    return entries
  }

  new Visitor({
    Property(node) {
      if (!("value" in node)) {
        return
      }

      const key = node.key.type === "Identifier" ? node.key.name : null
      const literalKey = node.key.type === "Literal" ? node.key.value : null

      if ((key !== "rules" && literalKey !== "rules") || node.value.type !== "ObjectExpression") {
        return
      }

      for (const property of node.value.properties) {
        if (property.type !== "Property") {
          continue
        }

        const rule = property.key.type === "Literal" ? property.key.value : undefined

        if (Predicate.isString(rule) && replacement(rule) !== undefined) {
          entries.push({ line: content.slice(0, property.start).split("\n").length, rule })
        }
      }
    },
  }).visit(parsed.program)

  return entries
}

/**
 * Each old config key and suppression, with the replacement rule id.
 */
export const assessRuleMigrations = Effect.fn("assessRuleMigrations")(function* (project: Project) {
  const path = yield* Path.Path

  const configs = project.customRules.sources.flatMap(({ file, content }) =>
    findRetiredRules(file, content).map(({ line, rule }) => ({
      location: `${path.relative(project.cwd, file)}:${line}`,
      rule,
    }))
  )

  const listed = yield* listLintedFiles(project.cwd).pipe(Effect.option)

  const comments = yield* Effect.forEach(
    Option.getOrElse(listed, () => []).filter((file) => SOURCE_FILE.test(file)),
    (file) =>
      readFileIfFile(path.join(project.cwd, file)).pipe(
        Effect.map((content) =>
          Option.match(content, {
            onNone: () => [],
            onSome: (text) =>
              findSuppressions(file, text).flatMap(({ line, rules }) =>
                rules
                  .filter((rule) => replacement(rule) !== undefined)
                  .map((rule) => ({ location: `${file}:${line}`, rule }))
              ),
          })
        )
      ),
    { concurrency: 16 }
  )

  const entries = [...configs, ...comments.flat()]

  const findings: Finding[] =
    entries.length === 0
      ? []
      : [
          {
            currentState: entries
              .map(
                ({ location, rule }) =>
                  `\`${location}\`: \`${rule}\` becomes \`${replacement(rule)}\`.`
              )
              .join("\n"),
            goal: [
              "Rename each listed rule key and suppression to its replacement. Keep rule severity, options, and suppression reasons.",
              "Run `adamantite check`, then run `adamantite doctor` again to confirm that no old rule names remain.",
            ],
            id: "antislop-rule-migration",
            integration: "oxlint",
            title: "The antislop rule namespaces have changed",
          },
        ]

  return {
    findings,
    warnings: Option.isNone(listed)
      ? [
          "Doctor could not list Oxlint files. Repair the lint config, then run Doctor again to check suppression comments.",
        ]
      : [],
  }
})
