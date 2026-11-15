import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { Finding, Integration } from "#lib/integrations/base.ts"
import type { Project } from "#lib/project/project.ts"
import type { Selection } from "#lib/project/selection.ts"
import {
  inspectRequiredOxfmtConfig,
  toOxfmtTsConfigContent,
} from "#lib/integrations/oxfmt/config.ts"
import { assessPluginLanguages } from "#lib/integrations/oxfmt/languages.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"
import { checkRunsTool } from "#lib/project/package-json.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

export const CONFIG_PATH = "oxfmt.config.ts"

// The JSON configs that Oxfmt read before `oxfmt.config.ts`.
const LEGACY_CONFIGS = [".oxfmtrc.json", ".oxfmtrc.jsonc"]

export const PACKAGE = { name: "oxfmt", version: getDependencyVersion("oxfmt") }

/**
 * The legacy JSON configs that the project has.
 */
const findLegacyConfigs = Effect.fn("findLegacyConfigs")(function* (cwd: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  return yield* Effect.filter(LEGACY_CONFIGS, (file) => fs.exists(path.join(cwd, file)), {
    concurrency: "unbounded",
  })
})

function listFiles(files: readonly string[]) {
  return files.map((file) => `\`${file}\``).join(", ")
}

/**
 * The findings for `oxfmt.config.ts`: a missing config, a legacy JSON config, which Oxfmt does not
 * load beside `oxfmt.config.ts`, and a kept config that does not use the format preset.
 */
const assessConfig = Effect.fn("assessConfig")(function* (cwd: string) {
  const path = yield* Path.Path

  const [content, legacy] = yield* Effect.all(
    [readFileIfExists(path.join(cwd, CONFIG_PATH)), findLegacyConfigs(cwd)],
    { concurrency: "unbounded" }
  )

  const reference = { content: toOxfmtTsConfigContent(), language: "ts" } as const

  if (legacy.length > 0) {
    return [
      {
        currentState: Option.isNone(content)
          ? `The project configures Oxfmt in the legacy ${listFiles(legacy)}, so Adamantite does not write \`${CONFIG_PATH}\`.`
          : `The project has ${listFiles(legacy)} beside \`${CONFIG_PATH}\`, and Oxfmt loads no config when it finds both.`,
        goal: [
          `Move the project settings into \`${CONFIG_PATH}\`, using the reference content as the base, and delete ${listFiles(legacy)}.`,
          "Run `adamantite update`, then `adamantite doctor`. It must not report this finding.",
        ],
        id: "legacy-oxfmt-config",
        integration: "oxfmt",
        notes: [
          "Preserve project-specific settings. Do not replace them with the reference defaults.",
        ],
        reference,
        title: "Legacy oxfmt configuration",
      },
    ] satisfies readonly Finding[]
  }

  if (Option.isNone(content)) {
    return [
      {
        currentState: `The selection runs Oxfmt, and \`${CONFIG_PATH}\` does not exist.`,
        goal: [
          `Run \`adamantite update\`. It writes \`${CONFIG_PATH}\`.`,
          "Run `adamantite doctor` again. It must not report this finding.",
        ],
        id: "missing-oxfmt-config",
        integration: "oxfmt",
        reference,
        title: "Missing oxfmt configuration",
      },
    ] satisfies readonly Finding[]
  }

  const inspection = inspectRequiredOxfmtConfig(content.value)

  return inspection.kind === "invalid"
    ? [
        {
          currentState: `\`${CONFIG_PATH}\` does not meet Adamantite's required shape. ${inspection.reason}`,
          goal: [inspection.goal],
          id: "invalid-oxfmt-config",
          integration: "oxfmt",
          notes: ["Treat the reference as a known-good example, not an exact replacement."],
          reference,
          title: "Invalid oxfmt configuration",
        } satisfies Finding,
      ]
    : []
})

export default {
  assess: (project: Project, _selection: Selection) =>
    Effect.gen(function* () {
      const pkg = assessPackage(project, PACKAGE, "the managed `check` and `fix` scripts", "oxfmt")

      const [config, languages] = yield* Effect.all(
        [assessConfig(project.cwd), assessPluginLanguages(project)],
        { concurrency: "unbounded" }
      )

      return {
        findings: [...pkg.findings, ...config, ...languages],
        packageActions: pkg.packageActions,
        warnings: pkg.warnings,
      }
    }),
  // Oxfmt loads no config when it finds a legacy config beside `oxfmt.config.ts`, so a project that
  // keeps one gets the `legacy-oxfmt-config` finding instead.
  files: ({ cwd }: Project, _selection: Selection) =>
    Effect.map(findLegacyConfigs(cwd), (legacy) =>
      legacy.length > 0 ? [] : [{ content: toOxfmtTsConfigContent(), path: CONFIG_PATH }]
    ),
  name: "oxfmt",
  packages: (_selection: Selection) => [PACKAGE],
  prepare: (_project: Project) => Effect.void,
  selected: ({ scripts }: Selection) => checkRunsTool(scripts, "oxfmt"),
} satisfies Integration
