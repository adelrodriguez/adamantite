import * as Array from "effect/Array"
import * as Digest from "effect/crypto/Digest"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import type { ManagedFile } from "#lib/integrations/base.ts"
import type { Project } from "#lib/project/project.ts"
import type { Selection } from "#lib/project/selection.ts"
import { integrations } from "#lib/integrations/index.ts"
import { format as formatCommand } from "#lib/integrations/oxfmt/command.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"
import { addRootDevDependencies } from "#lib/project/dependency-installer.ts"
import { writeLockfile } from "#lib/project/lockfile.ts"
import { resolvePackageDirectory } from "#lib/project/module-resolver.ts"
import { FailedToFormatFile, FailedToParseFile } from "#lib/shared/errors.ts"
import { ensureDirectory, readFileIfExists, writeFile } from "#lib/shared/filesystem.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import formatPreset from "#presets/format.ts"

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

const hashContent = (content: string) =>
  Digest.Digest.use((digest) =>
    digest.digestHex(Digest.sha256, new TextEncoder().encode(content))
  ).pipe(Effect.map((hex) => `sha256-${hex}`))

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
 * The config files that Oxfmt reads from the project root.
 */
const OXFMT_CONFIGS = ["oxfmt.config.ts", "oxfmt.config.mts", ".oxfmtrc.json", ".oxfmtrc.jsonc"]

const OxfmtManifest = Schema.fromJsonString(
  Schema.Struct({ bin: Schema.Struct({ oxfmt: Schema.String }) })
)

/**
 * Formats `content` as the project's Oxfmt formats the file at `file`, from the project root.
 */
type Format = (file: string, content: string) => Effect.Effect<string, FailedToFormatFile>

/**
 * The config that the project's Oxfmt formats with: the project's own config, or a copy of
 * Adamantite's format preset in a temporary folder when the project has none, such as before `init`
 * writes `oxfmt.config.ts`.
 */
const findConfig = Effect.fn("findConfig")(function* (cwd: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  const own = yield* Effect.findFirst(OXFMT_CONFIGS, (file) => fs.exists(path.join(cwd, file)))

  if (Option.isSome(own)) {
    return path.join(cwd, own.value)
  }

  const config = path.join(yield* fs.makeTempDirectoryScoped(), ".oxfmtrc.json")

  yield* fs.writeFileString(config, yield* stringifyJson(formatPreset).pipe(Effect.orDie))

  return config
})

/**
 * The formatter of the managed files in the project at `cwd`: the project's Oxfmt, which
 * `adamantite fix` runs too, so `fix` leaves a managed file unchanged and its hash still matches
 * the lockfile. A project that installs no Oxfmt, because the selection runs none, gets each file
 * as rendered. The temporary config lives as long as the scope.
 */
const makeFormatter = Effect.fn("makeFormatter")(function* (cwd: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const oxfmt = yield* resolvePackageDirectory(cwd, "oxfmt")

  if (Option.isNone(oxfmt)) {
    return ((_file, content) => Effect.succeed(content)) satisfies Format
  }

  const manifestPath = path.join(oxfmt.value, "package.json")

  const { bin } = yield* fs.readFileString(manifestPath).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(OxfmtManifest)),
    Effect.mapError((cause) => new FailedToParseFile({ cause, path: manifestPath }))
  )

  const config = yield* findConfig(cwd)

  return ((file, content) => {
    const command = formatCommand({
      bin: path.join(oxfmt.value, bin.oxfmt),
      config,
      cwd,
      path: file,
    })

    return Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(command.command, command.args, {
          cwd: command.cwd,
          stdin: Stream.make(new TextEncoder().encode(content)),
        })
      )

      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: "unbounded" }
      )

      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        return yield* new FailedToFormatFile({ output: stderr.trim(), path: file })
      }

      return stdout
    }).pipe(
      Effect.scoped,
      Effect.catchTag("PlatformError", (error) =>
        Effect.fail(new FailedToFormatFile({ output: error.message, path: file }))
      )
    )
  }) satisfies Format
})

/**
 * Sets up `selection` in `project`, the backend of `init` and `update`. It installs the packages of
 * every selected integration in one install, prepares what they need in `node_modules`, formats
 * their managed files with the project's Oxfmt, writes them under the write rule, deletes the
 * managed files that the selection dropped, and writes the lockfile last, formatted the same way.
 * Each hash in `written` is the hash of the bytes on disk. Running it twice leaves the project
 * unchanged.
 */
export const apply = Effect.fn("Setup.apply")(function* (project: Project, selection: Selection) {
  const { cwd } = project
  const selected = integrations.filter((integration) => integration.selected(selection))

  // Only the packages that the project does not declare at the managed version. A version from a
  // pnpm catalog stays, because `pnpm add` would replace the `catalog:` specifier, and the
  // integration's `assess` reports an outdated catalog entry.
  const installs = selected.flatMap((integration) =>
    integration
      .packages(project, selection)
      .flatMap(
        (pkg) => assessPackage(project, pkg, integration.name, integration.name).packageActions
      )
  )

  if (installs.length > 0) {
    yield* addRootDevDependencies(
      cwd,
      installs.map((action) => `${action.package}@${action.targetVersion}`)
    )
  }

  yield* Effect.forEach(selected, (integration) => integration.prepare(project), {
    concurrency: 1,
    discard: true,
  })

  const recorded: Readonly<Record<string, string>> = Option.match(project.lockfile, {
    onNone: () => ({}),
    onSome: (lockfile) => lockfile.written,
  })

  // After the install, so a project that this setup gives Oxfmt formats with it.
  const format = yield* makeFormatter(cwd)

  const rendered = yield* Effect.forEach(
    Array.flatten(
      yield* Effect.forEach(selected, (integration) => integration.files(project, selection), {
        concurrency: "unbounded",
      })
    ),
    (file) => Effect.map(format(file.path, file.content), (content) => ({ ...file, content })),
    { concurrency: "unbounded" }
  )

  const writes = yield* Effect.forEach(
    rendered,
    (file) => writeManagedFile(cwd, file, Option.fromNullishOr(recorded[file.path])),
    { concurrency: "unbounded" }
  )

  const renderedPaths = new Set(rendered.map((file) => file.path))

  const deletes = yield* Effect.forEach(
    Object.entries(recorded).filter(([file]) => !renderedPaths.has(file)),
    ([file, hash]) => deleteDroppedFile(cwd, file, hash),
    { concurrency: "unbounded" }
  )

  const written = writes.flatMap(({ hash, write }) =>
    Option.match(hash, { onNone: () => [], onSome: (value) => [[write.path, value] as const] })
  )

  const lockfile = yield* writeLockfile(
    cwd,
    { schemaVersion: 1, selection, version, written: Object.fromEntries(written) },
    format
  )

  return {
    files: [...writes.map(({ write }) => write), ...Array.getSomes(deletes)],
    installs,
    lockfile,
  }
}, Effect.scoped)
