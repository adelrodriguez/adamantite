import { fileURLToPath } from "node:url"

/**
 * The entry that runs Oxlint with the project's Oxlint runtime. The build writes it beside the CLI
 * bundle, as `dist/oxlint.js`, so the CLI runs the entry of its own version.
 */
const OXLINT_ENTRY = fileURLToPath(new URL("oxlint.js", import.meta.url))

/**
 * The variable through which a command names the project that the entry runs Oxlint for.
 */
export const PROJECT_VARIABLE = "ADAMANTITE_PROJECT"

/**
 * The `CommandRunner` command that runs Oxlint for the project at `project`. Arguments go after
 * `args`. The command names the project, because the CLI can run from a package runner cache, such
 * as `npm exec` or `pnpm dlx`, outside the project.
 */
export function getOxlintCommand(project: string) {
  return {
    args: [OXLINT_ENTRY],
    command: "node",
    cwd: project,
    env: { [PROJECT_VARIABLE]: project },
    name: "oxlint",
  } as const
}

/**
 * The project that the entry runs Oxlint for. A command names it through `PROJECT_VARIABLE`, as
 * `named`. An editor names no project and starts the entry from the project's `node_modules`, so
 * the project is the folder above the first `node_modules` folder in the entry path. The first
 * `node_modules` also covers a package manager store inside the project, such as
 * `node_modules/.pnpm/`. The Adamantite repository starts the entry as `src/oxlint.ts`, outside
 * `node_modules`, so there the project is `cwd`.
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
