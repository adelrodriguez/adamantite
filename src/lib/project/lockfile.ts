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

export const LOCKFILE_PATH = ".adamantite/adamantite-lock.json"

const SCHEMA_VERSION = 1

const ContentHash = Schema.String.check(Schema.isPattern(/^sha256-[0-9a-f]{64}$/))

export const Lockfile = Schema.Struct({
  schemaVersion: Schema.Literal(SCHEMA_VERSION),
  selection: Selection,
  version: Schema.String,
  written: Schema.Record(Schema.String, ContentHash),
})

export type Lockfile = typeof Lockfile.Type

export const hashContent = (content: string) =>
  Digest.Digest.use((digest) =>
    digest.digestHex(Digest.sha256, new TextEncoder().encode(content))
  ).pipe(Effect.map((hex) => `sha256-${hex}`))

const decodeSchemaVersion = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({ schemaVersion: Schema.Unknown, version: Schema.optional(Schema.Unknown) })
  )
)

const decodeLockfile = Schema.decodeUnknownEffect(Schema.fromJsonString(Lockfile))

const encodeLockfile = Schema.encodeEffect(Schema.fromJsonString(Lockfile, { space: 2 }))

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

export const readSelection = (root: string) =>
  readLockfile(root).pipe(
    Effect.catchTags({
      InvalidLockfile: () => Effect.succeedNone,
      UnsupportedLockfile: () => Effect.succeedNone,
    }),
    Effect.map((lockfile) => Option.map(lockfile, ({ selection }) => selection))
  )

const RELEASE = /^(\d+)\.(\d+)\.(\d+)(-)?/u

const releaseOrder = Order.Tuple([Order.Number, Order.Number, Order.Number, Order.Boolean])

function parseRelease(version: string) {
  const match = RELEASE.exec(version)

  if (match === null) {
    return Option.none()
  }

  const [, major, minor, patch, prerelease] = match
  const isRelease = prerelease === undefined

  return Option.some([Number(major), Number(minor), Number(patch), isRelease] as const)
}

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

  const isAhead = Option.match(
    Option.all([parseRelease(recorded), parseRelease(installed.value)]),
    {
      onNone: () => false,
      onSome: ([written, current]) => Order.isGreaterThan(releaseOrder)(written, current),
    }
  )

  return yield* isAhead ? new SetupAhead(versions) : new SetupOutdated(versions)
})

export const renderLockfile = (lockfile: Lockfile) =>
  encodeLockfile(lockfile).pipe(
    Effect.orDie,
    Effect.map((text) => `${text}\n`)
  )
