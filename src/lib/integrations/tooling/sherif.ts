import * as Effect from "effect/Effect"
import { defineIntegration, type AssessmentAction } from "#lib/integrations/base.ts"
import {
  getManagedScripts,
  normalizeDependencyVersion,
  readPackageJson,
} from "#lib/workspace/package-json.ts"

const VERSION = "1.11.1"

export default defineIntegration({
  assess: (cwd: string) =>
    Effect.gen(function* () {
      const packageJson = yield* readPackageJson(cwd)
      const managedScripts = getManagedScripts(packageJson)

      if (!managedScripts.includes("check:monorepo") && !managedScripts.includes("fix:monorepo")) {
        return {
          applicable: false,
          warnings: [],
        }
      }

      const packageSpecifier =
        packageJson.devDependencies?.sherif ?? packageJson.dependencies?.sherif
      const actions: AssessmentAction[] = []

      if (!packageSpecifier) {
        actions.push({
          description: `Install \`sherif@${VERSION}\` for the managed monorepo scripts.`,
          package: "sherif",
          targetVersion: VERSION,
          type: "install_package",
        })
      } else if (normalizeDependencyVersion(packageSpecifier) !== VERSION) {
        actions.push({
          currentVersion: packageSpecifier,
          description: `Update \`sherif\` from \`${packageSpecifier}\` to \`${VERSION}\`.`,
          package: "sherif",
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
  name: "sherif",
  version: VERSION,
})
