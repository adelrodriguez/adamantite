import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import type { Integration } from "#lib/integrations/base.ts"
import type { Selection } from "#lib/project/selection.ts"
import {
  assessConfigFile,
  type ConfigFile,
  renderConfigFile,
} from "#lib/integrations/config-file.ts"
import {
  inspectRequiredOxfmtConfig,
  OxfmtConfig,
  toOxfmtTsConfigContent,
} from "#lib/integrations/oxfmt/config.ts"
import { assessPluginLanguages } from "#lib/integrations/oxfmt/languages.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"
import { readConfig } from "#lib/project/config-loader.ts"
import * as Project from "#lib/project/index.ts"
import { checkRunsTool } from "#lib/project/package-json.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

const CONFIG = {
  conflicting: [".oxfmtrc.json", ".oxfmtrc.jsonc"],
  path: "oxfmt.config.ts",
  tool: "oxfmt",
  whyConflicting: "Oxfmt loads no config when it finds both",
} as const satisfies ConfigFile

export const PACKAGE = { name: "oxfmt", version: getDependencyVersion("oxfmt") }

export default {
  assess: (project: Project.Snapshot, _selection: Selection) =>
    Effect.gen(function* () {
      const cwd = yield* Project.Directory
      const path = yield* Path.Path
      const pkg = assessPackage(project, PACKAGE, "the managed `check` and `fix` scripts", "oxfmt")

      const [config, languages] = yield* Effect.all(
        [
          readConfig(cwd, path.join(cwd, CONFIG.path), OxfmtConfig).pipe(
            Effect.flatMap((content) =>
              assessConfigFile(
                cwd,
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
  files: (_project: Project.Snapshot, _selection: Selection) =>
    Effect.gen(function* () {
      return yield* renderConfigFile(yield* Project.Directory, CONFIG, toOxfmtTsConfigContent())
    }),
  name: "oxfmt",
  packages: (_project: Project.Snapshot, _selection: Selection) => [PACKAGE],
  selected: ({ scripts }: Selection) => checkRunsTool(scripts, "oxfmt"),
} satisfies Integration
