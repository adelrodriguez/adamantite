import * as Array from "effect/Array"
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
import type { ManagedFile } from "#lib/integrations/base.ts"
import type { Selection } from "#lib/project/selection.ts"
import { PackageAction } from "#lib/integrations/base.ts"
import { integrations } from "#lib/integrations/index.ts"
import { findOxfmtCli, format as formatCommand } from "#lib/integrations/oxfmt/command.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"
import { addRootDevDependencies } from "#lib/project/dependency-installer.ts"
import * as Project from "#lib/project/index.ts"
import { hashContent, LOCKFILE_PATH, renderLockfile } from "#lib/project/lockfile.ts"
import {
  MANAGED_SCRIPT_COMMANDS,
  readPackageJson,
  SCRIPT_ORDER,
  type Script,
} from "#lib/project/package-json.ts"
import { FailedToFormatFile } from "#lib/shared/errors.ts"
import { ensureDirectory, readFileIfExists, writeFile } from "#lib/shared/filesystem.ts"
import { formatJson, stringifyJson } from "#lib/shared/json.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import formatPreset from "#presets/format.ts"

const version = getPackageVersion()

export const FileWrite = Schema.TaggedUnion({
  Created: { path: Schema.String },
  Deleted: { path: Schema.String },
  Kept: { path: Schema.String },
  Replaced: { path: Schema.String },
  Unchanged: { path: Schema.String },
})

export type FileWrite = typeof FileWrite.Type

const { Created, Deleted, Kept, Replaced, Unchanged } = Data.taggedEnum<FileWrite>()

const ScriptName = Schema.Literals(SCRIPT_ORDER)

export const ScriptWrite = Schema.TaggedUnion({
  Added: { script: ScriptName },
  Replaced: { command: Schema.String, script: ScriptName },
  Unchanged: { script: ScriptName },
})

export type ScriptWrite = typeof ScriptWrite.Type

const ScriptWrites = Data.taggedEnum<ScriptWrite>()

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

const OXFMT_CONFIGS = ["oxfmt.config.ts", "oxfmt.config.mts", ".oxfmtrc.json", ".oxfmtrc.jsonc"]

type Format = (file: string, content: string) => Effect.Effect<string, FailedToFormatFile>

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

const makeFormatter = Effect.fn("makeFormatter")(function* (cwd: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const cli = yield* findOxfmtCli(cwd)

  if (Option.isNone(cli)) {
    return ((_file, content) => Effect.succeed(content)) satisfies Format
  }

  const config = yield* findConfig(cwd)

  return ((file, content) => {
    const command = formatCommand({
      cli: cli.value,
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

function getAdamantiteInstall({ packageJson }: Project.Snapshot): readonly PackageAction[] {
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

export const Result = Schema.Struct({
  files: Schema.Array(FileWrite),
  installs: Schema.Array(PackageAction),
  lockfile: Schema.Literals(["unchanged", "written"]),
  scripts: Schema.Array(ScriptWrite),
})

export type Result = typeof Result.Type

export const apply = Effect.fn("Setup.apply")(function* (
  project: Project.Snapshot,
  selection: Selection
) {
  const path = yield* Path.Path
  const cwd = yield* Project.Directory
  const selected = integrations.filter((integration) => integration.selected(selection))

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
      installs.map((action) => `${action.package}@${action.targetVersion}`)
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
  } satisfies Result
}, Effect.scoped)
