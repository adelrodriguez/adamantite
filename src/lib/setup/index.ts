import * as Array from "effect/Array"
import * as Digest from "effect/crypto/Digest"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import type { ManagedFile, PackageAction } from "#lib/integrations/base.ts"
import type { Project } from "#lib/project/project.ts"
import type { Selection } from "#lib/project/selection.ts"
import { integrations } from "#lib/integrations/index.ts"
import { format as formatCommand } from "#lib/integrations/oxfmt/command.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"
import { addRootDevDependencies } from "#lib/project/dependency-installer.ts"
import { LOCKFILE_PATH, renderLockfile } from "#lib/project/lockfile.ts"
import { resolvePackageDirectory } from "#lib/project/module-resolver.ts"
import { MANAGED_SCRIPT_COMMANDS, readPackageJson, type Script } from "#lib/project/package-json.ts"
import { FailedToFormatFile, FailedToParseFile } from "#lib/shared/errors.ts"
import { ensureDirectory, readFileIfExists, writeFile } from "#lib/shared/filesystem.ts"
import { formatJson, stringifyJson } from "#lib/shared/json.ts"
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
 * What `apply` did with one managed script in `package.json`. A managed script is the one exception
 * to whole files: `apply` sets the key to its command and overwrites what it held.
 */
export type ScriptWrite =
  /**
   * `package.json` had no such script, so Adamantite added it.
   */
  | { readonly _tag: "Added"; readonly script: Script }
  /**
   * The script ran `command`, so Adamantite replaced it with the managed command.
   */
  | { readonly _tag: "Replaced"; readonly command: string; readonly script: Script }
  /**
   * The script already ran the managed command.
   */
  | { readonly _tag: "Unchanged"; readonly script: Script }

const ScriptWrites = Data.taggedEnum<ScriptWrite>()

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
 * Sets each managed script of the selection to its command in the root `package.json`, and
 * overwrites what the key held. `apply` writes `package.json` in the layout that `format` gives it,
 * so `adamantite fix` leaves it unchanged. It writes only when a script changed or the install
 * changed the file, so a second run leaves `package.json` byte-identical.
 */
const writeScripts = Effect.fn("writeScripts")(function* (
  cwd: string,
  scripts: readonly Script[],
  installed: boolean,
  format: Format
) {
  const path = yield* Path.Path
  const target = path.join(cwd, "package.json")
  const packageJson = yield* readPackageJson(cwd)
  const current = packageJson.scripts ?? {}

  const writes = scripts.map((script) => {
    const command = current[script]

    return Predicate.isUndefined(command)
      ? ScriptWrites.Added({ script })
      : command === MANAGED_SCRIPT_COMMANDS[script]
        ? ScriptWrites.Unchanged({ script })
        : ScriptWrites.Replaced({ command, script })
  })

  if (!installed && writes.every(ScriptWrites.$is("Unchanged"))) {
    return writes
  }

  const managed = Object.fromEntries(
    scripts.map((script) => [script, MANAGED_SCRIPT_COMMANDS[script]])
  )

  const content = yield* format(
    "package.json",
    `${yield* formatJson(
      scripts.length === 0 ? packageJson : { ...packageJson, scripts: { ...current, ...managed } }
    ).pipe(Effect.orDie)}\n`
  )

  if (!Option.contains(yield* readFileIfExists(target), content)) {
    yield* writeFile(target, content)
  }

  return writes
})

/**
 * The install of `adamantite` itself, at the version that runs, when the project does not depend on
 * it. A project that depends on it keeps the version or source that it chose.
 */
function getAdamantiteInstall({ packageJson }: Project): readonly PackageAction[] {
  const declared = packageJson.devDependencies?.adamantite ?? packageJson.dependencies?.adamantite

  return Predicate.isUndefined(declared)
    ? [
        {
          description: `Install \`adamantite@${version}\`, which the presets and the managed scripts run.`,
          package: "adamantite",
          targetVersion: version,
          type: "install_package",
        },
      ]
    : []
}

/**
 * Sets up `selection` in `project`, the backend of `init` and `update`, and the only code that
 * writes target-project files. It installs `adamantite` and the packages of every selected
 * integration in one install, sets the managed scripts, prepares what the integrations need in
 * `node_modules`, formats their managed files with the project's Oxfmt, writes them under the write
 * rule, deletes the managed files that the selection dropped, and writes the lockfile last,
 * formatted the same way. Each hash in `written` is the hash of the bytes on disk. Running it twice
 * leaves the project unchanged.
 */
export const apply = Effect.fn("Setup.apply")(function* (project: Project, selection: Selection) {
  const path = yield* Path.Path
  const { cwd } = project
  const selected = integrations.filter((integration) => integration.selected(selection))

  // Only the packages that the project does not declare at the managed version. A version from a
  // pnpm catalog stays, because `pnpm add` would replace the `catalog:` specifier, and the
  // integration's `assess` reports an outdated catalog entry.
  const installs = [
    ...getAdamantiteInstall(project),
    ...selected.flatMap((integration) =>
      integration
        .packages(project, selection)
        .flatMap(
          (pkg) => assessPackage(project, pkg, integration.name, integration.name).packageActions
        )
    ),
  ]

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

  // After every managed file formats, so a config that Oxfmt cannot load fails before a write.
  const scripts = yield* writeScripts(cwd, selection.scripts, installs.length > 0, format)

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

  // Last, so the lockfile records what the steps above wrote.
  const lockfilePath = path.join(cwd, LOCKFILE_PATH)

  const lockfileContent = yield* format(
    LOCKFILE_PATH,
    yield* renderLockfile({
      schemaVersion: 1,
      selection,
      version,
      written: Object.fromEntries(written),
    })
  )

  const lockfile = Option.contains(yield* readFileIfExists(lockfilePath), lockfileContent)
    ? "unchanged"
    : "written"

  if (lockfile === "written") {
    yield* ensureDirectory(path.dirname(lockfilePath))
    yield* writeFile(lockfilePath, lockfileContent)
  }

  return {
    files: [...writes.map(({ write }) => write), ...Array.getSomes(deletes)],
    installs,
    lockfile,
    scripts,
  }
}, Effect.scoped)
