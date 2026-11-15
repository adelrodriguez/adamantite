import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import type { PackageAction } from "#lib/integrations/base.ts"
import type { LintPreset } from "#lib/project/selection.ts"
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

/**
 * Prints one line for each managed file that `Setup.apply` handled.
 */
export const printFileWrites = (writes: readonly FileWrite[]) =>
  Effect.forEach(writes, ({ _tag, path }) => LINES[_tag](path), {
    concurrency: 1,
    discard: true,
  })

/**
 * Prints the packages that `Setup.apply` installed or updated, with the version that each one had.
 */
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

/**
 * Prints one line for each managed script that `Setup.apply` set in `package.json`.
 */
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

/**
 * Prints the links that install the Zed extensions of the setup. Zed installs extensions only from
 * the user settings, so the project settings cannot install them.
 */
export const printZedExtensions = (presets: readonly LintPreset[]) =>
  Effect.gen(function* () {
    yield* Output.info("Install the Zed `oxc` extension: zed://extension/oxc")

    if (presets.includes("effect")) {
      yield* Output.info(
        "Install the Zed TypeScript language server extension: zed://extension/tsgo"
      )
    }
  })
