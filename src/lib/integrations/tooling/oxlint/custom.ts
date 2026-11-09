import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { Project } from "#lib/workspace/project.ts"
import {
  defineIntegration,
  type Finding,
  type IntegrationAssessment,
} from "#lib/integrations/base.ts"
import { readDirectoryIfExists, readFile } from "#lib/shared/filesystem.ts"
import { isDiscoveryComplete } from "#lib/workspace/custom-rules/discover.ts"
import {
  CUSTOM_RULES_DIRECTORY,
  hasLegacyRuleImports,
  inspectRuleFile,
  isRuleFile,
} from "#lib/workspace/custom-rules/inspect.ts"

const NAME = "oxlint-custom"

interface RulesFolder {
  readonly dir: string
  readonly ruleFiles: readonly string[]
}

const CONFIG_REFERENCE = `import { defineConfig } from "oxlint"
import core from "adamantite/lint"
import custom from "adamantite/rules"

export default defineConfig({
  extends: [core, custom()],
})
`

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
  assess: ({ customRules, cwd, workspace }: Project) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const relative = (target: string) => path.relative(cwd, target) || "."
      const packageDirectories = [cwd, ...workspace.packageDirectories]
      const { calls, legacyImports, unresolvedCalls, unresolvedImports } = customRules
      // A call with an unknown `dir`, or an unresolved import, can load any folder.
      const isComplete = isDiscoveryComplete(customRules)

      const defaultFolders = packageDirectories.map((directory) =>
        path.join(directory, CUSTOM_RULES_DIRECTORY)
      )

      const loadedFolders = Array.dedupe(calls.map((call) => call.dir))

      const oldDefaultFolders = packageDirectories.map((directory) =>
        path.join(directory, ".adamantite/rules")
      )

      const readFolders = yield* Effect.forEach(
        Array.dedupe([...defaultFolders, ...oldDefaultFolders, ...loadedFolders]),
        (dir) => readRulesFolder(dir),
        { concurrency: "unbounded" }
      )

      const existingFolders = Array.getSomes(readFolders)
      const folders = existingFolders.filter((folder) => folder.ruleFiles.length > 0)

      // A call without `dir` loads the default folder, which a project creates with its first rule.
      // A call that names a folder expects it to exist, and `custom()` loads nothing without it.
      const missingFolderCalls = Array.dedupeWith(
        calls.filter(
          (call) =>
            call.dir !== path.join(path.dirname(call.source), CUSTOM_RULES_DIRECTORY)
            && !existingFolders.some((folder) => folder.dir === call.dir)
        ),
        (first, second) => first.dir === second.dir
      )

      const legacyFolders = folders.filter(
        (folder) =>
          isComplete
          && oldDefaultFolders.includes(folder.dir)
          && !loadedFolders.includes(folder.dir)
      )

      if (isComplete && calls.length === 0 && folders.length === 0 && legacyImports.length === 0) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      const unknownNameCalls = calls.filter((call) => Option.isNone(call.name))

      const warnings = [
        ...unresolvedImports.map(
          ({ from, specifier }) =>
            `Doctor cannot resolve the import of \`${specifier}\` in \`${relative(from)}\`, so it does not check the \`custom()\` calls and rules folders behind it. For a workspace package, install the dependencies and run Doctor again.`
        ),
        ...unresolvedCalls.map(
          (source) =>
            `Doctor cannot read the \`dir\` of a \`custom()\` call in \`${relative(source)}\`, because it is not a string literal. Doctor does not check that rules folder.`
        ),
        ...unknownNameCalls.map(
          (call) =>
            `Doctor cannot read the \`name\` of a \`custom()\` call in \`${relative(call.source)}\`, because it is not a string literal. Doctor does not check that its plugin name differs from the other rules folders.`
        ),
      ]

      const findings: Finding[] = missingFolderCalls.map((call) => ({
        currentState: `The \`custom()\` call in \`${relative(call.source)}\` loads \`${relative(call.dir)}\`, but that folder does not exist, so Oxlint runs none of its rules.`,
        goal: [
          `Set \`dir\` to the folder that holds the rules, or move the rules to \`${relative(call.dir)}\`. A relative \`dir\` resolves from the file that calls \`custom()\`.`,
          "Preserve every other setting in the Oxlint config.",
        ],
        id: `custom-rules-folder-missing:${relative(call.dir)}`,
        integration: NAME,
        title: `The rules folder \`${relative(call.dir)}\` does not exist`,
      }))

      // An unloaded folder is reported only when discovery is complete.
      if (isComplete) {
        for (const folder of folders) {
          if (loadedFolders.includes(folder.dir) || legacyFolders.includes(folder)) {
            continue
          }

          findings.push({
            currentState: `No \`custom()\` call loads the rules in \`${relative(folder.dir)}\`, so Oxlint does not run them.`,
            goal: [
              `Load \`${relative(folder.dir)}\` with \`custom()\` from \`adamantite/rules\` in the Oxlint config of \`${relative(path.dirname(path.dirname(folder.dir)))}\`. A relative \`dir\` resolves from the file that calls \`custom()\`.`,
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

      const rules = yield* Effect.forEach(
        folders.flatMap((folder) => folder.ruleFiles.map((file) => path.join(folder.dir, file))),
        (rulePath) =>
          readFile(rulePath).pipe(
            Effect.map((content) => ({
              legacyImports: hasLegacyRuleImports(rulePath, content),
              problems: inspectRuleFile(rulePath, content),
              rulePath,
            }))
          ),
        { concurrency: "unbounded" }
      )

      const migrationSources = Array.dedupe([
        ...legacyImports,
        ...rules.filter((rule) => rule.legacyImports).map((rule) => rule.rulePath),
      ])

      if (migrationSources.length > 0 || legacyFolders.length > 0) {
        findings.push({
          currentState: [
            ...migrationSources.map(
              (source) => `\`${relative(source)}\` imports the old custom-rules API.`
            ),
            ...legacyFolders.map(
              (folder) =>
                `\`${relative(folder.dir)}\` is the previous default rules folder, and no current \`custom()\` call loads it.`
            ),
          ].join("\n"),
          goal: [
            'Import the rules-folder preset as `import custom from "adamantite/rules"`. Replace `adamantite/lint/custom` imports and keep `custom()` in the Oxlint config extends.',
            "Import `definePlugin`, `defineRule`, `eslintCompatPlugin`, and the Oxlint authoring types from `adamantite/rules/plugin`. Keep `RuleTester` at `adamantite/rules/testing`.",
            'Move `.adamantite/rules` to `.adamantite/lint`, or keep its path with `custom({ dir: ".adamantite/rules" })` and `rule add --dir .adamantite/rules`. A relative `dir` resolves from the file that calls `custom()`.',
            "If you keep `.adamantite/rules` or another explicit rules folder, add its rule and optional test patterns to Knip oxlint.entry. The preset defaults cover only `.adamantite/lint`.",
            "Update relative imports, tsconfig include paths, and Knip oxlint.entry patterns when a folder moves. Keep explicit rules folders and their options.",
            "Keep optional saved tests beside their rules as `<name>.test.ts`, and update their relative imports. For tests saved elsewhere, use `adamantite rule test --path <file>` and keep their Knip entry settings. Add a test only on request with `adamantite rule add test [name]`.",
            "Saved RuleTester tests use node:test. Exclude them from Vitest/Jest discovery. If TypeScript checks them, enable compilerOptions.allowImportingTsExtensions for .ts rule imports.",
            "Agents verify rules with RuleTester from `adamantite/rules/testing`, using stdin or a temporary file, and remove their temporary cases and fixtures. Preserve user-owned optional tests and CI steps. `adamantite rule test` runs saved tests only when explicitly invoked.",
            "Preserve rule behavior, plugin names, rule severity, rule options, and all other config settings. Run `adamantite check`, then run Doctor again.",
          ],
          id: "custom-rules-api-migration",
          integration: NAME,
          reference: { content: CONFIG_REFERENCE, language: "ts" },
          title: "Custom rules need migration to the current agent workflow",
        })
      }

      for (const { problems, rulePath } of rules) {
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

      const loadingCalls = calls.flatMap(({ dir, name, source }) =>
        Option.isSome(name) && folders.some((folder) => folder.dir === dir)
          ? [{ dir, name: name.value, source }]
          : []
      )

      for (const [name, group] of Object.entries(
        Array.groupBy(loadingCalls, (call) => call.name)
      )) {
        const dirs = Array.dedupe(group.map((call) => call.dir))

        if (dirs.length < 2) {
          continue
        }

        findings.push({
          currentState: `${dirs.length.toLocaleString("en-US")} rules folders use the plugin name \`${name}\`: ${dirs.map((dir) => `\`${relative(dir)}\``).join(", ")}. Oxlint rejects two plugins with the same name in one run.`,
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
