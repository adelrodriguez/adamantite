import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import type { ReleaseNotes } from "#lib/project/release-notes.ts"
import * as Mode from "#terminal/mode.ts"
import * as Output from "#terminal/output.ts"

// Changesets publishes a GitHub release for each version, tagged `v<version>`.
const RELEASES_URL = "https://github.com/adelrodriguez/adamantite/releases/tag"

/**
 * The notes as one Markdown document for an agent: each release since the recorded version, oldest
 * first, so the agent applies the migrations in the order of the releases.
 */
function renderMarkdown({ changelog, from, releases }: ReleaseNotes) {
  return [
    `# Adamantite release notes since ${from}`,
    "",
    `These notes come from \`${changelog}\`, oldest release first. Follow each migration step that applies to this project.`,
    ...releases.flatMap(({ notes, version }) => ["", `## ${version}`, "", notes]),
  ].join("\n")
}

/**
 * Prints the notes of the releases since the version that wrote the lockfile. A terminal gets one
 * link for each release, a run without a terminal gets the notes as Markdown, and `--json` puts
 * them in the document instead.
 */
export const printReleaseNotes = Effect.fn("printReleaseNotes")(function* (notes: ReleaseNotes) {
  if (notes.releases.length === 0) {
    return
  }

  yield* Mode.match(yield* Mode.CurrentMode, {
    Json: () => Effect.void,
    Menu: () =>
      Effect.forEach(
        notes.releases,
        ({ version }) =>
          Output.info(`Adamantite ${version} release notes: ${RELEASES_URL}/v${version}`),
        { concurrency: 1, discard: true }
      ),
    Plain: () => Console.log(renderMarkdown(notes)),
  })
})
