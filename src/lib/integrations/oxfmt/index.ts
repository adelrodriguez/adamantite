import * as Effect from "effect/Effect"
import type { Integration } from "#lib/integrations/base.ts"
import type { Project } from "#lib/project/project.ts"
import type { Selection } from "#lib/project/selection.ts"
import {
  assessConfigFile,
  type ConfigFile,
  readConfigFile,
  renderConfigFile,
} from "#lib/integrations/config-file.ts"
import {
  inspectRequiredOxfmtConfig,
  OxfmtConfig,
  toOxfmtTsConfigContent,
} from "#lib/integrations/oxfmt/config.ts"
import { assessPluginLanguages } from "#lib/integrations/oxfmt/languages.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"
import { checkRunsTool } from "#lib/project/package-json.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

const CONFIG = {
  legacy: [".oxfmtrc.json", ".oxfmtrc.jsonc"],
  path: "oxfmt.config.ts",
  tool: "oxfmt",
  whyLegacyBlocks: "Oxfmt loads no config when it finds both",
} as const satisfies ConfigFile

export const PACKAGE = { name: "oxfmt", version: getDependencyVersion("oxfmt") }

export default {
  assess: (project: Project, _selection: Selection) =>
    Effect.gen(function* () {
      const pkg = assessPackage(project, PACKAGE, "the managed `check` and `fix` scripts", "oxfmt")

      const [config, languages] = yield* Effect.all(
        [
          readConfigFile(project.cwd, CONFIG, OxfmtConfig).pipe(
            Effect.flatMap((content) =>
              assessConfigFile(
                project.cwd,
                CONFIG,
                content,
                toOxfmtTsConfigContent(),
                inspectRequiredOxfmtConfig
              )
            )
          ),
          assessPluginLanguages(project),
        ],
        { concurrency: "unbounded" }
      )

      return {
        findings: [...pkg.findings, ...config, ...languages],
        packageActions: pkg.packageActions,
        warnings: pkg.warnings,
      }
    }),
  files: ({ cwd }: Project, _selection: Selection) =>
    renderConfigFile(cwd, CONFIG, toOxfmtTsConfigContent()),
  name: "oxfmt",
  packages: (_project: Project, _selection: Selection) => [PACKAGE],
  prepare: (_project: Project) => Effect.void,
  selected: ({ scripts }: Selection) => checkRunsTool(scripts, "oxfmt"),
} satisfies Integration
