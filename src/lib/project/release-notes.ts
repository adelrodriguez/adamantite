import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

/**
 * The notes of one Adamantite release, from its section of the changelog.
 */
export const Release = Schema.Struct({ notes: Schema.String, version: Schema.String })

/**
 * The releases after the version that wrote the lockfile, up to the installed version, oldest
 * first, and the changelog of the installed package that they come from.
 */
export const ReleaseNotes = Schema.Struct({
  changelog: Schema.String,
  from: Schema.String,
  releases: Schema.Array(Release),
})

export type ReleaseNotes = typeof ReleaseNotes.Type

/**
 * The notes of the releases after `from`. Not implemented yet.
 */
export const readReleaseNotes = Effect.fn("readReleaseNotes")(function* (
  _root: string,
  _from: string
) {
  return yield* Effect.succeed(Option.none<ReleaseNotes>())
})
