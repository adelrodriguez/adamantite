import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { defineIntegration, type IntegrationAssessment } from "#lib/integrations/base.ts"
import { getManagedScripts } from "#lib/workspace/package-json.ts"

const files = [{ path: "AGENTS.md", type: "config" }] as const

export default defineIntegration({
  // In a monorepo, Doctor runs at the root and checks only the root. A package can have its own
  // `AGENTS.md`, but Doctor does not require it.
  assess: (cwd: string, packageJson: PackageJson) =>
    Effect.gen(function* () {
      const managedScripts = getManagedScripts(packageJson)

      if (managedScripts.length === 0) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const exists = yield* fs.exists(path.join(cwd, files[0].path))
      const scriptFlags = managedScripts.map((script) => `--script ${script}`).join(" ")

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
                  "`AGENTS.md` is the instruction file that most coding agents read, such as Codex and Cursor. Claude Code reads it when the project has no `CLAUDE.md`. Gemini CLI reads it only when `context.fileName` in its settings names it.",
                  `To create the file with an Adamantite section that lists the package scripts, run \`adamantite init --non-interactive ${scriptFlags} --agents\`.`,
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
