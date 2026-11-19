import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import {
  findInstalledPackage,
  parseRelease,
  releaseOrder,
} from "#lib/project/adamantite-version.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"

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

// Changesets starts the section of each release with `## <version>`, the newest release first.
const RELEASE_HEADING = /^## /mu

/**
 * The release sections of a changelog that Changesets writes, newest first.
 */
function parseChangelog(content: string) {
  return content
    .split(RELEASE_HEADING)
    .slice(1)
    .map((section) => {
      const [version = "", ...notes] = section.split("\n")

      return { notes: notes.join("\n").trim(), version: version.trim() }
    })
}

/**
 * The path of the changelog that the Adamantite package of the project at `root` ships, relative to
 * `root`, or none when the project installs no Adamantite. The changelog of the installed package
 * ends at the installed version, so it never names a release that the project does not run.
 */
export const findChangelog = Effect.fn("findChangelog")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const installed = yield* findInstalledPackage(root)

  if (Option.isNone(installed)) {
    return Option.none<string>()
  }

  // The resolver returns real paths, so a project path through a symlink compares as a real path.
  const real = yield* fs.realPath(root).pipe(Effect.orElseSucceed(() => root))

  return Option.some(path.relative(real, path.join(installed.value.directory, "CHANGELOG.md")))
})

/**
 * The notes of the releases after `from`, the version that wrote the lockfile, from the changelog
 * that the installed Adamantite package ships, so the notes match the code that the project runs.
 * None when the project installs no Adamantite, when the installed package has no changelog, or
 * when `from` is no release, such as a Git source.
 */
export const readReleaseNotes = Effect.fn("readReleaseNotes")(function* (
  root: string,
  from: string
) {
  const path = yield* Path.Path
  const start = parseRelease(from)
  const changelog = yield* findChangelog(root)

  if (Option.isNone(start) || Option.isNone(changelog)) {
    return Option.none<ReleaseNotes>()
  }

  const content = yield* readFileIfExists(path.resolve(root, changelog.value))

  if (Option.isNone(content)) {
    return Option.none<ReleaseNotes>()
  }

  // Oldest first, so an agent applies the migrations in the order of the releases.
  const releases = Array.reverse(
    parseChangelog(content.value).filter(({ version }) =>
      Option.exists(parseRelease(version), (release) =>
        Order.isGreaterThan(releaseOrder)(release, start.value)
      )
    )
  )

  return Option.some<ReleaseNotes>({ changelog: changelog.value, from, releases })
})
