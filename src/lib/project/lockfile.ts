import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { Selection } from "#lib/project/selection.ts"
import { InvalidLockfile, UnsupportedLockfile } from "#lib/shared/errors.ts"
import { ensureDirectory, readFileIfExists, writeFile } from "#lib/shared/filesystem.ts"

/**
 * The lockfile, relative to the project root. In a monorepo, the root is the workspace root.
 */
export const LOCKFILE_PATH = ".adamantite/adamantite-lock.json"

const SCHEMA_VERSION = 1

/**
 * The hash of the content that Adamantite wrote, as `sha256-` and lowercase hex.
 */
const ContentHash = Schema.String.check(Schema.isPattern(/^sha256-[0-9a-f]{64}$/))

/**
 * What `init` and `update` record in the target project. `version` is the Adamantite version that
 * last wrote the lockfile. `written` maps each file that Adamantite wrote whole, by its path from
 * the project root, to the hash of what it wrote.
 */
export const Lockfile = Schema.Struct({
  schemaVersion: Schema.Literal(SCHEMA_VERSION),
  selection: Selection,
  version: Schema.String,
  written: Schema.Record(Schema.String, ContentHash),
})

export type Lockfile = typeof Lockfile.Type

// The schema version decides which schema reads the rest, so it decodes first.
const decodeSchemaVersion = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Struct({ schemaVersion: Schema.Unknown }))
)

const decodeLockfile = Schema.decodeUnknownEffect(Schema.fromJsonString(Lockfile))

const encodeLockfile = Schema.encodeEffect(Schema.fromJsonString(Lockfile, { space: 2 }))

/**
 * Reads the lockfile of the project at `root`. None when the project has no lockfile.
 */
export const readLockfile = Effect.fn("readLockfile")(function* (root: string) {
  const path = yield* Path.Path
  const content = yield* readFileIfExists(path.join(root, LOCKFILE_PATH))

  if (Option.isNone(content)) {
    return Option.none<Lockfile>()
  }

  const { schemaVersion } = yield* decodeSchemaVersion(content.value).pipe(
    Effect.mapError((error) => new InvalidLockfile({ issue: error.message, path: LOCKFILE_PATH }))
  )

  if (schemaVersion !== SCHEMA_VERSION) {
    return yield* new UnsupportedLockfile({ path: LOCKFILE_PATH, schemaVersion })
  }

  return Option.some(
    yield* decodeLockfile(content.value).pipe(
      Effect.mapError((error) => new InvalidLockfile({ issue: error.message, path: LOCKFILE_PATH }))
    )
  )
})

/**
 * Writes `lockfile` to the project at `root`, unless the file already holds it. `unchanged` means
 * that the file already held it. Only `init` and `update` write the lockfile, through `lib/setup`.
 */
export const writeLockfile = Effect.fn("writeLockfile")(function* (
  root: string,
  lockfile: Lockfile
) {
  const path = yield* Path.Path
  const lockfilePath = path.join(root, LOCKFILE_PATH)
  const content = `${yield* encodeLockfile(lockfile).pipe(Effect.orDie)}\n`
  const current = yield* readFileIfExists(lockfilePath)

  if (Option.contains(current, content)) {
    return "unchanged" as const
  }

  yield* ensureDirectory(path.dirname(lockfilePath))
  yield* writeFile(lockfilePath, content)

  return "written" as const
})
