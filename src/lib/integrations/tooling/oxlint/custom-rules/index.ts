import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import {
  defineIntegration,
  type Finding,
  type IntegrationAssessment,
} from "#lib/integrations/base.ts"
import {
  CUSTOM_RULES_MODULE,
  findCustomRulesCalls,
  inspectRuleFile,
  isRuleFile,
} from "#lib/integrations/tooling/oxlint/custom-rules/inspect.ts"
import { readDirectoryIfExists, readFile } from "#lib/shared/filesystem.ts"
import { CUSTOM_RULES_DIRECTORY } from "#lib/workspace/custom-rules.ts"
import { checkIsMonorepo, getWorkspacePackageDirectories } from "#lib/workspace/monorepo.ts"

const NAME = "custom-rules"

const SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".mjs",
  ".mts",
  ".ts",
])

interface ResolvedCall {
  /**
   * Absolute rules folder, or `null` when only running the config can resolve it.
   */
  readonly dir: string | null
  readonly name: string | null
  readonly source: string
}

interface RulesFolder {
  readonly dir: string
  readonly ruleFiles: readonly string[]
}

const CONFIG_REFERENCE = `import { defineConfig } from "oxlint"
import core from "adamantite/lint"
import custom from "adamantite/lint/custom"

export default defineConfig({
  extends: [core, custom()],
})
`

/**
 * The `custom()` calls in the top-level script files of a package directory, such as
 * `oxlint.config.ts` or the entry module of a shared tooling package.
 */
const findCalls = Effect.fn("findCustomRulesCalls")(function* (directory: string) {
  const path = yield* Path.Path
  const entries = Option.getOrElse(yield* readDirectoryIfExists(directory), (): string[] => [])
  const scripts = entries.filter(
    (entry) => SCRIPT_EXTENSIONS.has(path.extname(entry)) && !/\.d\.[cm]?ts$/.test(entry)
  )
  const calls = yield* Effect.forEach(
    scripts,
    (entry) =>
      Effect.gen(function* () {
        const source = path.join(directory, entry)
        // A directory with a script extension cannot be read as a file; it holds no calls.
        const content = yield* readFile(source).pipe(Effect.orElseSucceed(() => ""))

        if (!content.includes(CUSTOM_RULES_MODULE)) {
          return []
        }

        return findCustomRulesCalls(source, content).map((call): ResolvedCall => ({
          dir: call.dir === null ? null : path.resolve(directory, call.dir),
          name: call.name,
          source,
        }))
      }),
    { concurrency: "unbounded" }
  )

  return calls.flat()
})

const readRulesFolder = Effect.fn("readRulesFolder")(function* (dir: string) {
  const entries = yield* readDirectoryIfExists(dir)

  return entries.pipe(
    Option.map((names): RulesFolder => ({
      dir,
      ruleFiles: names.filter((name) => isRuleFile(name)),
    }))
  )
})

export default defineIntegration({
  assess: (cwd: string) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const relative = (target: string) => path.relative(cwd, target) || "."
      const packageDirectories = [
        cwd,
        ...((yield* checkIsMonorepo(cwd)) ? yield* getWorkspacePackageDirectories(cwd) : []),
      ]
      const calls = (yield* Effect.forEach(
        packageDirectories,
        (directory) => findCalls(directory),
        {
          concurrency: "unbounded",
        }
      )).flat()
      const defaultFolders = packageDirectories.map((directory) =>
        path.join(directory, CUSTOM_RULES_DIRECTORY)
      )
      const loadedFolders = Array.dedupe(
        calls.flatMap((call) => (call.dir === null ? [] : [call.dir]))
      )
      const folders = Array.getSomes(
        yield* Effect.forEach(
          Array.dedupe([...defaultFolders, ...loadedFolders]),
          (dir) => readRulesFolder(dir),
          { concurrency: "unbounded" }
        )
      ).filter((folder) => folder.ruleFiles.length > 0)

      if (calls.length === 0 && folders.length === 0) {
        return { applicable: false, warnings: [] } satisfies IntegrationAssessment
      }

      const unresolvedCalls = calls.filter((call) => call.dir === null || call.name === null)
      const warnings = unresolvedCalls.map(
        (call) =>
          `Doctor cannot read the \`dir\` or \`name\` of a \`custom()\` call in \`${relative(call.source)}\`, because it is not a string literal. Doctor does not check that rules folder.`
      )
      const findings: Finding[] = []

      // An unresolved call can load any folder, so an unloaded folder is reported only when every
      // call is resolved.
      if (unresolvedCalls.length === 0) {
        for (const folder of folders) {
          if (loadedFolders.includes(folder.dir)) {
            continue
          }

          findings.push({
            currentState: `\`${relative(folder.dir)}\` has ${folder.ruleFiles.length} rule file(s), but no \`custom()\` call loads it, so Oxlint does not run them.`,
            goal: [
              `Load \`${relative(folder.dir)}\` with \`custom()\` from \`adamantite/lint/custom\` in the Oxlint config of \`${relative(path.dirname(path.dirname(folder.dir)))}\`. A relative \`dir\` resolves from the file that calls \`custom()\`.`,
              "Give each rules folder its own plugin name with the `name` option, because Oxlint rejects two plugins with the same name in one run.",
              "Preserve every other setting in the Oxlint config.",
            ],
            id: `custom-rules-not-loaded:${relative(folder.dir)}`,
            integration: NAME,
            reference: { content: CONFIG_REFERENCE, language: "ts" },
            title: `Custom rules in \`${relative(folder.dir)}\` are not loaded`,
          })
        }
      }

      for (const folder of folders) {
        for (const file of folder.ruleFiles) {
          const rulePath = path.join(folder.dir, file)
          const problems = inspectRuleFile(rulePath, yield* readFile(rulePath))

          if (problems.length === 0) {
            continue
          }

          findings.push({
            currentState: `\`${relative(rulePath)}\` cannot load as a rule, so the whole lint run fails with "Failed to parse oxlint configuration file":\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
            goal: [
              "The file parses, uses only TypeScript that type stripping can erase (no `enum`, `namespace` with values, parameter properties, or `import x = require()`), and exports the rule as default.",
              "Keep the behavior of the rule.",
            ],
            id: `custom-rule-cannot-load:${relative(rulePath)}`,
            integration: NAME,
            notes: [
              "A file that starts with `_` is a helper, not a rule. Rename a helper file so that it starts with `_`.",
            ],
            title: `Custom rule \`${relative(rulePath)}\` cannot load`,
          })
        }
      }

      const loadingCalls = calls.filter(
        (call) =>
          call.dir !== null
          && folders.some((folder) => folder.dir === call.dir)
          && call.name !== null
      )

      for (const [name, group] of Object.entries(
        Array.groupBy(loadingCalls, (call) => call.name ?? "")
      )) {
        const dirs = Array.dedupe(group.map((call) => call.dir ?? ""))

        if (dirs.length < 2) {
          continue
        }

        findings.push({
          currentState: `${dirs.length} rules folders use the plugin name \`${name}\`: ${dirs.map((dir) => `\`${relative(dir)}\``).join(", ")}. Oxlint rejects two plugins with the same name in one run.`,
          goal: [
            `Each \`custom()\` call that loads one of these folders passes a \`name\` that no other rules folder uses, such as \`custom({ name: "web" })\`. The calls are in ${Array.dedupe(group.map((call) => `\`${relative(call.source)}\``)).join(", ")}.`,
            "Rule names in `oxlint-disable` comments and `rules` settings use the new plugin name.",
          ],
          id: `custom-rules-duplicate-name:${name}`,
          integration: NAME,
          title: `Rules folders share the plugin name \`${name}\``,
        })
      }

      return {
        applicable: true,
        findings,
        packageActions: [],
        warnings,
      } satisfies IntegrationAssessment
    }),
  kind: "tooling",
  name: NAME,
})
