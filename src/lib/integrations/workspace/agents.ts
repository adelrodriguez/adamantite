import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { Project } from "#lib/project/project.ts"
import { defineIntegration, type IntegrationAssessment } from "#lib/integrations/base.ts"
import { formatInitCommand } from "#lib/project/init-command.ts"
import { getManagedScripts } from "#lib/project/package-json.ts"

const files = [{ path: "AGENTS.md", type: "config" }] as const

export default defineIntegration({
  // With a lockfile, the integration applies when the selection includes the agent guidance.
  // Without one, it applies to a project with managed scripts. In a monorepo, Doctor runs at the
  // root and checks only the root. A package can have its own `AGENTS.md`, but Doctor does not
  // require it.
  assess: ({ cwd, lockfile, packageJson }: Project) =>
    Effect.gen(function* () {
      const managedScripts = getManagedScripts(packageJson)

      const applies = Option.match(lockfile, {
        onNone: () => managedScripts.length > 0,
        onSome: ({ selection }) => selection.agents,
      })

      if (!applies) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const exists = yield* fs.exists(path.join(cwd, files[0].path))

      return {
        applicable: true,
        findings: exists
          ? []
          : [
              {
                currentState: "The project root has no `AGENTS.md`.",
                goal: [
                  "Create `AGENTS.md` at the project root with the instructions that coding agents must follow in this project.",
                  "Run `adamantite doctor` again. It must not report this finding.",
                ],
                id: "missing-agents-md",
                integration: "agents",
                notes: [
                  "`AGENTS.md` is where coding agents start. It points to the other documentation of the project.",
                  `To create the file with an Adamantite section that lists the package scripts, run \`${formatInitCommand({ agents: true, scripts: managedScripts })}\`.`,
                ],
                title: "Missing AGENTS.md",
              },
            ],
        packageActions: [],
        warnings: [],
      } satisfies IntegrationAssessment
    }),
  files,
  kind: "workspace",
  name: "agents",
})
