import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as String from "effect/String"
import type { Project } from "#lib/project/project.ts"
import github from "#lib/integrations/ci/github.ts"
import zed from "#lib/integrations/editors/zed.ts"
import { getImportedLintPresets } from "#lib/integrations/oxlint/config.ts"
import { SETTINGS_PATH as VSCODE_SETTINGS_PATH } from "#lib/integrations/vscode/index.ts"
import tsconfig from "#lib/integrations/workspace/tsconfig.ts"
import { ADAMANTITE_AGENTS_START_MARKER } from "#lib/project/agents.ts"
import { checkRunsTool, getManagedScripts, SCRIPT_ORDER } from "#lib/project/package-json.ts"
import { INIT_EDITORS, LINT_PRESETS, type Selection } from "#lib/project/selection.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"

// The settings file of each editor, whose existence selects the editor.
const EDITOR_SETTINGS = { vscode: VSCODE_SETTINGS_PATH, zed: zed.config } as const

/**
 * The selection that `init` would record for a project that an earlier Adamantite version set up.
 * Each part comes from the detection that Doctor applies without a lockfile: the managed scripts,
 * the presets that the root Oxlint config imports, the TypeScript configs that name a preset, the
 * editor settings and the workflow that exist, and the Adamantite section of `AGENTS.md`.
 */
export const inferSelection = Effect.fn("inferSelection")(function* (project: Project) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { cwd, lintConfig, packageJson } = project

  const managedScripts = getManagedScripts(packageJson)
  const scripts = SCRIPT_ORDER.filter((script) => managedScripts.includes(script))

  const imported: readonly string[] = Option.match(lintConfig, {
    onNone: () => [],
    onSome: getImportedLintPresets,
  })

  const editors = yield* Effect.filter(
    INIT_EDITORS,
    (editor) => fs.exists(path.join(cwd, EDITOR_SETTINGS[editor])),
    { concurrency: "unbounded" }
  )

  const workflow = yield* github.detect(cwd)
  const agents = yield* readFileIfExists(path.join(cwd, "AGENTS.md"))

  return {
    agents: Option.exists(agents, String.includes(ADAMANTITE_AGENTS_START_MARKER)),
    ci: Predicate.isTagged(workflow, "Missing") ? null : "github",
    editors,
    presets: checkRunsTool(scripts, "oxlint")
      ? ["core", ...LINT_PRESETS.filter((preset) => imported.includes(preset))]
      : [],
    scripts,
    typescript: Option.getOrNull(yield* tsconfig.detectPreset(project)),
  } satisfies Selection
})
