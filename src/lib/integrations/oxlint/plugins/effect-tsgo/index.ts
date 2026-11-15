import * as Effect from "effect/Effect"
import type { Project } from "#lib/project/project.ts"
import { assessTsconfigPlugin } from "#lib/integrations/effect-language-service.ts"
import { defineOxlintPlugin, NativeRuntime } from "#lib/integrations/oxlint/plugins/base.ts"
import { resolveEffectRuntime } from "#lib/integrations/oxlint/plugins/effect-tsgo/runtime.ts"

const NAME = "@effect/tsgo"

export default defineOxlintPlugin({
  assess: (project: Project) =>
    Effect.gen(function* () {
      const tsconfig = yield* assessTsconfigPlugin(project, NAME)

      return {
        findings: tsconfig.findings,
        warnings: tsconfig.warnings,
      }
    }),
  name: NAME,
  runtime: new NativeRuntime({ resolve: resolveEffectRuntime }),
})
