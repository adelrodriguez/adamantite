import * as Digest from "effect/crypto/Digest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { readInstalledVersion } from "#lib/project/adamantite-version.ts"
import { Selection } from "#lib/project/selection.ts"
import {
  InvalidLockfile,
  SetupAhead,
  SetupOutdated,
  UnsupportedLockfile,
} from "#lib/shared/errors.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"

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

/**
 * The hash that `written` records for `content`.
 */
export const hashContent = (content: string) =>
  Digest.Digest.use((digest) =>
    digest.digestHex(Digest.sha256, new TextEncoder().encode(content))
  ).pipe(Effect.map((hex) => `sha256-${hex}`))

// The schema version decides which schema reads the rest, so it decodes first. The Adamantite
// version decodes leniently, because a newer schema can change its type.
const decodeSchemaVersion = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({ schemaVersion: Schema.Unknown, version: Schema.optional(Schema.Unknown) })
  )
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

  const { schemaVersion, version } = yield* decodeSchemaVersion(content.value).pipe(
    Effect.mapError((error) => new InvalidLockfile({ issue: error.message, path: LOCKFILE_PATH }))
  )

  if (schemaVersion !== SCHEMA_VERSION) {
    return yield* new UnsupportedLockfile({
      path: LOCKFILE_PATH,
      schemaVersion,
      version: Option.liftPredicate(version, Predicate.isString),
    })
  }

  return Option.some(
    yield* decodeLockfile(content.value).pipe(
      Effect.mapError((error) => new InvalidLockfile({ issue: error.message, path: LOCKFILE_PATH }))
    )
  )
})

/**
 * The selection that the lockfile of the project at `root` records. None when the project has no
 * lockfile, or when its lockfile does not decode, which Doctor reports.
 */
export const readSelection = (root: string) =>
  readLockfile(root).pipe(
    Effect.catchTags({
      InvalidLockfile: () => Effect.succeedNone,
      UnsupportedLockfile: () => Effect.succeedNone,
    }),
    Effect.map((lockfile) => Option.map(lockfile, ({ selection }) => selection))
  )

const RELEASE = /^(\d+)\.(\d+)\.(\d+)(-)?/u

const releaseOrder = Order.Tuple([Order.Number, Order.Number, Order.Number, Order.Number])

/**
 * The major, minor, and patch numbers of `version`, then 1 for a release and 0 for a prerelease,
 * which comes before its release. None when `version` does not start with the numbers.
 */
function parseRelease(version: string) {
  const match = RELEASE.exec(version)

  return match === null
    ? Option.none()
    : Option.some([
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        match[4] === undefined ? 1 : 0,
      ] as const)
}

/**
 * Verifies that the Adamantite version that the project at `root` installs wrote `lockfile`, the
 * one comparison of the two versions. It fails with `SetupOutdated` when an older version wrote the
 * lockfile, and with `SetupAhead` when a newer release did. It compares with the installed version,
 * not the running one, so a CLI from another install, such as `npx`, judges the project as its own
 * CLI does. It succeeds without a lockfile, or when the project installs no Adamantite, such as
 * before an install.
 */
export const verifyLockfileVersion = Effect.fn("verifyLockfileVersion")(function* (
  root: string,
  lockfile: Option.Option<Lockfile>
) {
  if (Option.isNone(lockfile)) {
    return
  }

  const installed = yield* readInstalledVersion(root)
  const recorded = lockfile.value.version

  if (Option.isNone(installed) || installed.value === recorded) {
    return
  }

  const versions = { installed: installed.value, path: LOCKFILE_PATH, recorded }

  // A version that does not start with release numbers, such as a Git source, and a prerelease of
  // the installed prerelease's release compare as older, because `update` with the installed
  // version is then the repair that ends the drift.
  const isAhead = Option.match(
    Option.all([parseRelease(recorded), parseRelease(installed.value)]),
    {
      onNone: () => false,
      onSome: ([written, current]) => Order.isGreaterThan(releaseOrder)(written, current),
    }
  )

  return yield* isAhead ? new SetupAhead(versions) : new SetupOutdated(versions)
})

/**
 * The JSON text of `lockfile`. Only `init` and `update` write the lockfile, through `lib/setup`,
 * which formats it as it formats a managed file.
 */
export const renderLockfile = (lockfile: Lockfile) =>
  encodeLockfile(lockfile).pipe(
    Effect.orDie,
    Effect.map((text) => `${text}\n`)
  )
