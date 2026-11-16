import * as Effect from "effect/Effect"
import * as Path from "effect/Path"

/**
 * The file name of the entry that runs Oxlint with the project's Oxlint runtime. The build writes
 * it beside the CLI bundle, as `dist/oxlint.js`, so the CLI runs the entry of its own version.
 * `scripts/test-build.ts` checks that the build writes it.
 */
export const OXLINT_ENTRY_FILE = "oxlint.js"

/**
 * The entry as an editor in the target project starts it, relative to the workspace folder.
 */
export const EDITOR_OXLINT_ENTRY = `node_modules/adamantite/dist/${OXLINT_ENTRY_FILE}`

/**
 * The variable through which a command names the project that the entry runs Oxlint for.
 */
export const PROJECT_VARIABLE = "ADAMANTITE_PROJECT"

/**
 * The `CommandRunner` command that runs Oxlint for the project at `project`. Arguments go after
 * `args`. The command names the project, because the CLI can run from a package runner cache, such
 * as `npm exec` or `pnpm dlx`, outside the project.
 */
export const getOxlintCommand = Effect.fn("getOxlintCommand")(function* (project: string) {
  const path = yield* Path.Path

  // The module URL of the bundle and of a source run is a `file:` URL, so a failure is a defect.
  const entry = yield* path
    .fromFileUrl(new URL(OXLINT_ENTRY_FILE, import.meta.url))
    .pipe(Effect.orDie)

  return {
    args: [entry],
    command: "node",
    cwd: project,
    env: { [PROJECT_VARIABLE]: project },
    name: "oxlint",
  } as const
})

/**
 * The project that the entry runs Oxlint for. A command names it through `PROJECT_VARIABLE`, as
 * `named`. An editor names no project and starts the entry from the project's `node_modules`, so
 * the project is the folder above the first `node_modules` folder in the entry path. The first
 * `node_modules` also covers a package manager store inside the project, such as
 * `node_modules/.pnpm/`. The Adamantite repository starts the entry as `src/oxlint/index.ts`,
 * outside `node_modules`, so there the project is `cwd`.
 */
export function getProjectDirectory(entry: string, cwd: string, named?: string): string {
  if (named !== undefined && named !== "") {
    return named
  }

  const indexes = [entry.indexOf("/node_modules/"), entry.indexOf("\\node_modules\\")].filter(
    (index) => index !== -1
  )

  return indexes.length === 0 ? cwd : entry.slice(0, Math.min(...indexes))
}
