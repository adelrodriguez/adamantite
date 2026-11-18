import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { Finding, IntegrationAssessment } from "#lib/integrations/base.ts"
import * as Project from "#lib/project/index.ts"
import { readDirectoryIfExists } from "#lib/shared/filesystem.ts"
import { publicImport } from "#lib/shared/package-exports.ts"
import { DEFAULT_DIRECTORY, isRuleFile } from "#presets/rules/folder.ts"

const NAME = "oxlint-custom"

interface RulesFolder {
  readonly dir: string
  readonly ruleFiles: readonly string[]
}

const CONFIG_REFERENCE = `import { defineConfig } from "oxlint"
import core from "${publicImport("./lint")}"
import custom from "${publicImport("./rules")}"

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

/**
 * The `oxlint-custom` integration, which only assesses. It reports a rules folder that no
 * `custom()` call loads, a `dir` that names a missing folder, and rules folders that share a plugin
 * name. A rule file that does not load stops Oxlint, so the `oxlint-config-load-failure` finding of
 * the Oxlint integration reports it. A saved test is the user's choice, so it gets no finding.
 */
export default {
  assess: ({ customRules, workspace }: Project.Snapshot) =>
    Effect.gen(function* () {
      const cwd = yield* Project.Directory
      const path = yield* Path.Path
      const relative = (target: string) => path.relative(cwd, target) || "."
      const packageDirectories = [cwd, ...workspace.packageDirectories]
      const { calls, unloadedConfigs } = customRules
      // A config that does not load can load any folder.
      const isComplete = customRules.unloadedConfigs.length === 0

      const defaultFolders = packageDirectories.map((directory) =>
        path.join(directory, DEFAULT_DIRECTORY)
      )

      const loadedFolders = Array.dedupe(calls.map((call) => call.dir))

      const readFolders = yield* Effect.forEach(
        Array.dedupe([...defaultFolders, ...loadedFolders]),
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
            call.dir !== path.join(path.dirname(call.source), DEFAULT_DIRECTORY)
            && !existingFolders.some((folder) => folder.dir === call.dir)
        ),
        (first, second) => first.dir === second.dir
      )

      if (isComplete && calls.length === 0 && folders.length === 0) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      const warnings = unloadedConfigs.map(
        ({ file, reason }) =>
          `Doctor cannot load \`${relative(file)}\`, so it does not check the \`custom()\` calls and rules folders behind it. Node.js reported: ${reason}`
      )

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
          if (loadedFolders.includes(folder.dir)) {
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

      const loadingCalls = calls.filter(({ dir }) => folders.some((folder) => folder.dir === dir))

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
  name: NAME,
}
