import * as Effect from "effect/Effect"
import type { Integration } from "#lib/integrations/base.ts"
import type * as Project from "#lib/project/index.ts"
import type { Selection } from "#lib/project/selection.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"
import { checkRunsTool } from "#lib/project/package-json.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

export const PACKAGE = { name: "sherif", version: getDependencyVersion("sherif") }

// `adamantite analyze` runs Sherif only in a monorepo.
export default {
  assess: (project: Project.Snapshot, _selection: Selection) =>
    Effect.sync(() =>
      project.workspace.isMonorepo
        ? assessPackage(project, PACKAGE, "the managed `analyze` script in a monorepo", "sherif")
        : { findings: [], packageActions: [], warnings: [] }
    ),
  files: (_project: Project.Snapshot, _selection: Selection) => Effect.succeed([]),
  name: "sherif",
  packages: ({ workspace }: Project.Snapshot, _selection: Selection) =>
    workspace.isMonorepo ? [PACKAGE] : [],
  selected: ({ scripts }: Selection) => checkRunsTool(scripts, "sherif"),
} satisfies Integration
