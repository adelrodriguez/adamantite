import * as Effect from "effect/Effect"
import type { FileWrite } from "#lib/setup/index.ts"
import * as Output from "#terminal/output.ts"

const LINES = {
  Created: (path) => Output.success(`\`${path}\` created.`),
  Deleted: (path) =>
    Output.success(`\`${path}\` deleted, because the setup no longer includes it.`),
  Kept: (path) =>
    Output.info(
      `\`${path}\` kept, because it has changes that Adamantite did not write. \`adamantite doctor\` reports a change that breaks the setup.`
    ),
  Replaced: (path) => Output.success(`\`${path}\` replaced with the current version.`),
  Unchanged: (path) => Output.info(`\`${path}\` is up to date.`),
} as const satisfies Record<FileWrite["_tag"], (path: string) => ReturnType<typeof Output.info>>

/**
 * Prints one line for each managed file that `Setup.apply` handled.
 */
export const printFileWrites = (writes: readonly FileWrite[]) =>
  Effect.forEach(writes, ({ _tag, path }) => LINES[_tag](path), {
    concurrency: 1,
    discard: true,
  })
