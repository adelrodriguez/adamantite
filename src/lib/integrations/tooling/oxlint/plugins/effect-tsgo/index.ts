import * as Effect from "effect/Effect"
import type { Project } from "#lib/workspace/project.ts"
import { defineManagedPlugin } from "#lib/integrations/tooling/oxlint/plugins/define.ts"
import { assessPrepareScript } from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/prepare-script.ts"
import {
  assessTsconfigPlugin,
  updateTsconfigPlugin,
} from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/tsconfig.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

const NAME = "@effect/tsgo"

export default defineManagedPlugin({
  assess: (project: Project) =>
    Effect.gen(function* () {
      const tsconfig = yield* assessTsconfigPlugin(project, NAME)

      return {
        findings: [...assessPrepareScript(project.packageJson, NAME), ...tsconfig.findings],
        warnings: tsconfig.warnings,
      }
    }),
  name: NAME,
  preset: "effect",
  /**
   * Write the language service entry in `tsconfig.json`.
   */
  update: (cwd: string) => updateTsconfigPlugin(cwd),
  version: getDependencyVersion("@effect/tsgo"),
})
