import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { IntegrationAssessment } from "#lib/integrations/base.ts"
import type * as Project from "#lib/project/index.ts"
import type { Script } from "#lib/project/package-json.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"

export function definePackageTooling(options: {
  readonly isRequired?: (project: Project.Snapshot) => boolean
  readonly name: string
  readonly purpose: string
  readonly scripts: readonly Script[]
  readonly version: string
}) {
  return {
    assess: (project: Project.Snapshot) =>
      Effect.sync((): IntegrationAssessment => {
        const isApplicable =
          Option.exists(project.lockfile, ({ selection }) =>
            options.scripts.some((script) => selection.scripts.includes(script))
          )
          && (options.isRequired === undefined || options.isRequired(project))

        if (!isApplicable) {
          return { applicable: false }
        }

        return {
          applicable: true,
          ...assessPackage(project, options, options.purpose, options.name),
        }
      }),
    name: options.name,
    version: options.version,
  }
}
