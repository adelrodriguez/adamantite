import * as Effect from "effect/Effect"
import type { Integration } from "#lib/integrations/base.ts"
import type { Project } from "#lib/project/project.ts"
import type { Selection } from "#lib/project/selection.ts"
import {
  assessConfigFile,
  type ConfigFile,
  renderConfigFile,
} from "#lib/integrations/config-file.ts"
import {
  inspectRequiredKnipConfig,
  toKnipTsConfigContent,
  toKnipWorkspace,
} from "#lib/integrations/knip/config.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"
import { checkRunsTool } from "#lib/project/package-json.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

const CONFIG = {
  legacy: ["knip.json", "knip.jsonc"],
  path: "knip.config.ts",
  tool: "knip",
  whyLegacyBlocks: "Knip loads the JSON config and ignores `knip.config.ts`",
} as const satisfies ConfigFile

export const PACKAGE = { name: "knip", version: getDependencyVersion("knip") }

export default {
  assess: (project: Project, selection: Selection) =>
    Effect.gen(function* () {
      const pkg = assessPackage(project, PACKAGE, "the managed `analyze` script", "knip")
      const workspace = toKnipWorkspace(project, selection)

      const config = yield* assessConfigFile(
        project.cwd,
        CONFIG,
        toKnipTsConfigContent(workspace),
        (content) => inspectRequiredKnipConfig(content, workspace)
      )

      return {
        findings: [...pkg.findings, ...config],
        packageActions: pkg.packageActions,
        warnings: pkg.warnings,
      }
    }),
  files: (project: Project, selection: Selection) =>
    renderConfigFile(
      project.cwd,
      CONFIG,
      toKnipTsConfigContent(toKnipWorkspace(project, selection))
    ),
  name: "knip",
  packages: (_selection: Selection) => [PACKAGE],
  prepare: (_project: Project) => Effect.void,
  selected: ({ scripts }: Selection) => checkRunsTool(scripts, "knip"),
} satisfies Integration
