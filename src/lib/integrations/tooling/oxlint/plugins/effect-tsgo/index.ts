import * as Effect from "effect/Effect"
import type { Project } from "#lib/workspace/project.ts"
import { defineOxlintPlugin } from "#lib/integrations/tooling/oxlint/plugins/base.ts"
import { assessPrepareScript } from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/prepare-script.ts"
import { resolveEffectRuntime } from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/runtime.ts"
import {
  assessTsconfigPlugin,
  updateTsconfigPlugin,
} from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/tsconfig.ts"

const NAME = "@effect/tsgo"

export default defineOxlintPlugin({
  assess: (project: Project) =>
    Effect.gen(function* () {
      const tsconfig = yield* assessTsconfigPlugin(project, NAME)

      return {
        findings: [...assessPrepareScript(project.packageJson, NAME), ...tsconfig.findings],
        warnings: tsconfig.warnings,
      }
    }),
  name: NAME,
  runtime: { _tag: "Native", resolve: resolveEffectRuntime },
  /**
   * Write the language service entry in `tsconfig.json`.
   */
  update: (cwd: string) => updateTsconfigPlugin(cwd),
})
