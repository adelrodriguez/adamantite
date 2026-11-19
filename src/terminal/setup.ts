import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import type { PackageAction } from "#lib/integrations/base.ts"
import type { FileWrite, ScriptWrite } from "#lib/setup/index.ts"
import { MANAGED_SCRIPT_COMMANDS } from "#lib/project/package-json.ts"
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

export const printFileWrites = (writes: readonly FileWrite[]) =>
  Effect.forEach(writes, ({ _tag, path }) => LINES[_tag](path), {
    concurrency: 1,
    discard: true,
  })

export const printInstalls = (installs: readonly PackageAction[]) =>
  installs.length === 0
    ? Effect.void
    : Output.success(
        [
          "Packages installed:",
          ...installs.map(
            (action) =>
              `${action.package}: ${action.type === "install_package" ? "not installed" : action.currentVersion} → ${action.targetVersion}`
          ),
        ].join("\n")
      )

export const printScriptWrites = (writes: readonly ScriptWrite[]) =>
  Effect.forEach(
    writes,
    (write) =>
      Match.valueTags(write, {
        Added: ({ script }) =>
          Output.success(`\`${script}\` script added: \`${MANAGED_SCRIPT_COMMANDS[script]}\`.`),
        Replaced: ({ command, script }) =>
          Output.success(
            `\`${script}\` script replaced: \`${command}\` → \`${MANAGED_SCRIPT_COMMANDS[script]}\`.`
          ),
        Unchanged: ({ script }) => Output.info(`\`${script}\` script is up to date.`),
      }),
    { concurrency: 1, discard: true }
  )
