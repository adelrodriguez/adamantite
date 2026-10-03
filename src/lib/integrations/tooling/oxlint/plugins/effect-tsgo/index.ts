import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import {
  checkImportsLintPreset,
  defineManagedPlugin,
} from "#lib/integrations/tooling/oxlint/plugins/define.ts"
import { runPatch } from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/patch.ts"
import {
  assessPrepareScript,
  updatePrepareScript,
} from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/prepare-script.ts"
import {
  assessTsconfigPlugin,
  updateTsconfigPlugin,
} from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/tsconfig.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

const NAME = "@effect/tsgo"

export default defineManagedPlugin({
  assess: (cwd: string, packageJson: PackageJson) =>
    Effect.gen(function* () {
      const tsconfig = yield* assessTsconfigPlugin(cwd, NAME)

      return {
        findings: [...assessPrepareScript(packageJson, NAME), ...tsconfig.findings],
        warnings: tsconfig.warnings,
      }
    }),
  /**
   * Whether the project needs the patch: `oxlint.config.ts` imports the `effect` preset. How the
   * project runs Oxlint does not matter, because Oxlint cannot load the preset unpatched.
   */
  detect: (cwd: string) => checkImportsLintPreset(cwd, "effect"),
  name: NAME,
  patch: runPatch,
  preset: "effect",
  /**
   * Write the `prepare` script that runs `adamantite prepare`, and the language service entry in
   * `tsconfig.json`.
   */
  update: (cwd: string) =>
    Effect.gen(function* () {
      return {
        prepare: yield* updatePrepareScript(cwd),
        tsconfig: yield* updateTsconfigPlugin(cwd),
      }
    }),
  version: getDependencyVersion("@effect/tsgo"),
})
