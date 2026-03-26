import * as Effect from "effect/Effect"
import { defineIntegration, type AssessmentAction } from "#lib/integrations/base.ts"
import {
  getManagedScripts,
  normalizeDependencyVersion,
  readPackageJson,
} from "#lib/workspace/package-json.ts"

const VERSION = "0.17.2"

export default defineIntegration({
  assess: (cwd: string) =>
    Effect.gen(function* () {
      const packageJson = yield* readPackageJson(cwd)
      const managedScripts = getManagedScripts(packageJson)

      if (!managedScripts.includes("check") && !managedScripts.includes("fix")) {
        return {
          actions: [],
          status: "not_applicable",
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
        status: actions.length === 0 ? "healthy" : "needs_action",
        warnings: [],
      }
    }),
  kind: "tooling",
  name: "oxlint-tsgolint",
  version: VERSION,
})
