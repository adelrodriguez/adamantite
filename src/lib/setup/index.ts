import * as Array from "effect/Array"
import * as Digest from "effect/crypto/Digest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as String from "effect/String"
import type { Project } from "#lib/project/project.ts"
import github from "#lib/integrations/ci/github.ts"
import vscode from "#lib/integrations/editors/vscode.ts"
import zed from "#lib/integrations/editors/zed.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import {
  getImportedLintPresets,
  toOxlintTsConfigContent,
} from "#lib/integrations/tooling/oxlint/config.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import tsconfig from "#lib/integrations/workspace/tsconfig.ts"
import { ADAMANTITE_AGENTS_START_MARKER } from "#lib/project/agents.ts"
import { writeLockfile } from "#lib/project/lockfile.ts"
import { checkRunsTool, getManagedScripts, SCRIPT_ORDER } from "#lib/project/package-json.ts"
import { INIT_EDITORS, LINT_PRESETS, type Selection } from "#lib/project/selection.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

const version = getPackageVersion()

const editorIntegrations = { vscode, zed } as const

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
    (editor) => fs.exists(path.join(cwd, editorIntegrations[editor].config)),
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

/**
 * Whether `selection` sets up nothing.
 */
export function checkIsEmptySelection(selection: Selection): boolean {
  return (
    !selection.agents
    && selection.ci === null
    && selection.editors.length === 0
    && selection.presets.length === 0
    && selection.scripts.length === 0
    && selection.typescript === null
  )
}

/**
 * The files that Adamantite writes whole for `selection`, with the content that this version
 * writes, by their path from the project root.
 */
const renderManagedFiles = Effect.fn("renderManagedFiles")(function* (
  project: Project,
  selection: Selection
) {
  const facts = { isMonorepo: project.workspace.isMonorepo, lintConfig: project.lintConfig }
  const presets = LINT_PRESETS.filter((preset) => selection.presets.includes(preset))
  const lints = selection.presets.length > 0

  return [
    ...(lints
      ? [
          { content: toOxlintTsConfigContent(presets), path: oxlint.config },
          { content: oxfmt.render(facts), path: oxfmt.config },
        ]
      : []),
    ...(checkRunsTool(selection.scripts, "knip")
      ? [{ content: knip.render(facts), path: knip.config }]
      : []),
    // In a monorepo, init leaves the root `tsconfig.json` to the project.
    ...(selection.typescript === null || project.workspace.isMonorepo
      ? []
      : [{ content: yield* tsconfig.render(selection.typescript), path: tsconfig.config }]),
  ]
})

const hashContent = (content: string) =>
  Digest.Digest.use((digest) =>
    digest.digestHex(Digest.sha256, new TextEncoder().encode(content))
  ).pipe(Effect.map((hex) => `sha256-${hex}`))

/**
 * Writes the lockfile of `project` with `selection` and this Adamantite version. `written` records
 * each managed file that is still Adamantite's: the file equals what this version writes, or its
 * hash equals the hash that the lockfile recorded. A file that the user changed drops out. Running
 * it twice gives the same lockfile.
 */
export const recordLockfile = Effect.fn("recordLockfile")(function* (
  project: Project,
  selection: Selection
) {
  const path = yield* Path.Path

  const recorded: Readonly<Record<string, string>> = Option.match(project.lockfile, {
    onNone: () => ({}),
    onSome: (lockfile) => lockfile.written,
  })

  const written = yield* Effect.forEach(
    yield* renderManagedFiles(project, selection),
    ({ content, path: file }) =>
      Effect.gen(function* () {
        const current = yield* readFileIfExists(path.join(project.cwd, file))

        if (Option.isNone(current)) {
          return []
        }

        const hash = yield* hashContent(current.value)

        return current.value === content || recorded[file] === hash ? [[file, hash] as const] : []
      }),
    { concurrency: "unbounded" }
  )

  return yield* writeLockfile(project.cwd, {
    schemaVersion: 1,
    selection,
    version,
    written: Object.fromEntries(Array.flatten(written)),
  })
})
