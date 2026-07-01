import * as Effect from "effect/Effect"
import { defineIntegration, type AssessmentAction } from "#lib/integrations/base.ts"
import {
  getManagedScripts,
  normalizeDependencyVersion,
  readPackageJson,
} from "#lib/workspace/package-json.ts"

const VERSION = "0.24.0"

export default defineIntegration({
  assess: (cwd: string) =>
    Effect.gen(function* () {
      const packageJson = yield* readPackageJson(cwd)
      const managedScripts = getManagedScripts(packageJson)

      if (!managedScripts.includes("check") && !managedScripts.includes("fix")) {
        return {
          applicable: false,
          warnings: [],
        }
      }

      const packageSpecifier =
        packageJson.devDependencies?.["oxlint-tsgolint"] ??
        packageJson.dependencies?.["oxlint-tsgolint"]
      const actions: AssessmentAction[] = []

      if (!packageSpecifier) {
        actions.push({
          description: `Install \`oxlint-tsgolint@${VERSION}\` for the managed lint scripts.`,
          package: "oxlint-tsgolint",
          targetVersion: VERSION,
          type: "install_package",
        })
      } else if (normalizeDependencyVersion(packageSpecifier) !== VERSION) {
        actions.push({
          currentVersion: packageSpecifier,
          description: `Update \`oxlint-tsgolint\` from \`${packageSpecifier}\` to \`${VERSION}\`.`,
          package: "oxlint-tsgolint",
          targetVersion: VERSION,
          type: "update_package",
        })
      }

      return {
        actions,
        applicable: true,
        warnings: [],
      }
    }),
  kind: "tooling",
  name: "oxlint-tsgolint",
  version: VERSION,
})
