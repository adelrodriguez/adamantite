import * as Array from "effect/Array"
import * as Digest from "effect/crypto/Digest"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { ManagedFile } from "#lib/integrations/base.ts"
import type { Project } from "#lib/project/project.ts"
import { integrations } from "#lib/integrations/index.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import tsconfig from "#lib/integrations/workspace/tsconfig.ts"
import { addRootDevDependencies } from "#lib/project/dependency-installer.ts"
import { writeLockfile } from "#lib/project/lockfile.ts"
import { checkRunsTool } from "#lib/project/package-json.ts"
import { LINT_PRESETS, type Selection } from "#lib/project/selection.ts"
import { ensureDirectory, readFileIfExists, writeFile } from "#lib/shared/filesystem.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

export { inferSelection } from "#lib/integrations/selection.ts"

const version = getPackageVersion()

/**
 * What `apply` did with one managed file.
 */
export type FileWrite =
  /**
   * The file did not exist, so Adamantite wrote it.
   */
  | { readonly _tag: "Created"; readonly path: string }
  /**
   * The file's hash equaled the hash that the lockfile recorded, so Adamantite wrote the current
   * version over it.
   */
  | { readonly _tag: "Replaced"; readonly path: string }
  /**
   * The file already held the current version.
   */
  | { readonly _tag: "Unchanged"; readonly path: string }
  /**
   * The user changed the file, so Adamantite kept it. Its integration's `assess` judges it.
   */
  | { readonly _tag: "Kept"; readonly path: string }
  /**
   * The selection no longer renders the file, and its hash still equaled the recorded hash.
   */
  | { readonly _tag: "Deleted"; readonly path: string }

const { Created, Deleted, Kept, Replaced, Unchanged } = Data.taggedEnum<FileWrite>()

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
 * The managed files of the integrations that have not moved to a folder of their own yet. Their own
 * setup steps in `init` write them, so `apply` records their hashes, and never writes or deletes
 * them.
 */
const LEGACY_PATHS: ReadonlySet<string> = new Set([
  oxlint.config,
  oxfmt.config,
  knip.config,
  tsconfig.config,
])

/**
 * The files that the setup steps of `init` write for `selection`, with the content that this
 * version writes, by their path from the project root.
 */
const renderLegacyFiles = Effect.fn("renderLegacyFiles")(function* (
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
  ] satisfies readonly ManagedFile[]
})

const hashContent = (content: string) =>
  Digest.Digest.use((digest) =>
    digest.digestHex(Digest.sha256, new TextEncoder().encode(content))
  ).pipe(Effect.map((hex) => `sha256-${hex}`))

/**
 * The `written` entries of the files that the setup steps of `init` wrote: each file that equals
 * what this version writes, or whose hash equals the hash that the lockfile recorded.
 */
const recordLegacyFiles = Effect.fn("recordLegacyFiles")(function* (
  project: Project,
  selection: Selection,
  recorded: Readonly<Record<string, string>>
) {
  const path = yield* Path.Path

  const entries = yield* Effect.forEach(
    yield* renderLegacyFiles(project, selection),
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

  return Array.flatten(entries)
})

/**
 * Applies the write rule to one managed file: write it when it does not exist, or when its hash
 * equals the hash that the lockfile recorded. `hash` is what `written` records, and none for a file
 * that the user changed.
 */
const writeManagedFile = Effect.fn("writeManagedFile")(function* (
  cwd: string,
  file: ManagedFile,
  recorded: Option.Option<string>
) {
  const path = yield* Path.Path
  const target = path.join(cwd, file.path)
  const current = yield* readFileIfExists(target)
  const hash = Option.some(yield* hashContent(file.content))

  const write = Effect.gen(function* () {
    yield* ensureDirectory(path.dirname(target))
    yield* writeFile(target, file.content)
  })

  if (Option.isNone(current)) {
    yield* write

    return { hash, write: Created({ path: file.path }) }
  }

  if (current.value === file.content) {
    return { hash, write: Unchanged({ path: file.path }) }
  }

  if (Option.contains(recorded, yield* hashContent(current.value))) {
    yield* write

    return { hash, write: Replaced({ path: file.path }) }
  }

  return { hash: Option.none<string>(), write: Kept({ path: file.path }) }
})

/**
 * Deletes a file that Adamantite wrote and the selection no longer renders, when its hash still
 * equals the recorded hash. A file that the user changed stays, and leaves the lockfile.
 */
const deleteDroppedFile = Effect.fn("deleteDroppedFile")(function* (
  cwd: string,
  file: string,
  recorded: string
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const target = path.join(cwd, file)
  const current = yield* readFileIfExists(target)

  if (Option.isNone(current) || (yield* hashContent(current.value)) !== recorded) {
    return Option.none<FileWrite>()
  }

  yield* fs.remove(target)

  return Option.some(Deleted({ path: file }))
})

/**
 * Sets up `selection` in `project`, the backend of `init` and `update`. It installs the packages of
 * every selected integration in one install, prepares what they need in `node_modules`, writes
 * their managed files under the write rule, deletes the managed files that the selection dropped,
 * and writes the lockfile last. Running it twice leaves the project unchanged.
 */
export const apply = Effect.fn("Setup.apply")(function* (project: Project, selection: Selection) {
  const { cwd } = project
  const selected = integrations.filter((integration) => integration.selected(selection))
  const packages = selected.flatMap((integration) => integration.packages(selection))

  if (packages.length > 0) {
    yield* addRootDevDependencies(
      cwd,
      packages.map(({ name, version: target }) => `${name}@${target}`)
    )
  }

  yield* Effect.forEach(selected, (integration) => integration.prepare?.(project) ?? Effect.void, {
    concurrency: 1,
    discard: true,
  })

  const recorded: Readonly<Record<string, string>> = Option.match(project.lockfile, {
    onNone: () => ({}),
    onSome: (lockfile) => lockfile.written,
  })

  const rendered = Array.flatten(
    yield* Effect.forEach(selected, (integration) => integration.files(project, selection), {
      concurrency: "unbounded",
    })
  )

  const writes = yield* Effect.forEach(
    rendered,
    (file) => writeManagedFile(cwd, file, Option.fromNullishOr(recorded[file.path])),
    { concurrency: "unbounded" }
  )

  const renderedPaths = new Set(rendered.map((file) => file.path))

  const deletes = yield* Effect.forEach(
    Object.entries(recorded).filter(
      ([file]) => !renderedPaths.has(file) && !LEGACY_PATHS.has(file)
    ),
    ([file, hash]) => deleteDroppedFile(cwd, file, hash),
    { concurrency: "unbounded" }
  )

  const written = [
    ...(yield* recordLegacyFiles(project, selection, recorded)),
    ...writes.flatMap(({ hash, write }) =>
      Option.match(hash, { onNone: () => [], onSome: (value) => [[write.path, value] as const] })
    ),
  ]

  const lockfile = yield* writeLockfile(cwd, {
    schemaVersion: 1,
    selection,
    version,
    written: Object.fromEntries(written),
  })

  return {
    files: [...writes.map(({ write }) => write), ...Array.getSomes(deletes)],
    lockfile,
  }
})
